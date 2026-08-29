// OSS emulator of the AWS Lambda Durable Execution runtime that
// @aws/durable-execution-sdk-js expects. See ./PROTOCOL.md for the full
// reverse-engineered protocol. Mounted inside aws-shim: it serves the two
// durable planes over the Lambda endpoint and drives the invoke/replay loop.
//
// Store: Postgres (opaque operation log keyed by (arn, opId); the SDK owns all
// replay logic). Driver: invokes the durability-enabled function's durable
// entry in-process, servicing GetState/Checkpoint against this store, and
// suspends/resumes on callbacks.

import crypto from 'node:crypto';
import path from 'node:path';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ACCOUNT = '000000000000';

// Functions whose Invoke should start a durable execution (name substrings).
const DURABLE_FUNCTIONS = (process.env.DURABLE_FUNCTIONS || 'v2-orchestrator')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
export const isDurableFunction = (name) => DURABLE_FUNCTIONS.some((f) => name.includes(f));

// Action → Status the SDK reads back (client-lambda OperationStatus values).
const STATUS_FOR_ACTION = {
  START: 'STARTED',
  SUCCEED: 'SUCCEEDED',
  FAIL: 'FAILED',
  RETRY: 'STARTED',
};

let pool;
let lambdaRoot;
const handlerCache = new Map();
const runLocks = new Map(); // arn → Promise (serialize invokes per execution)

export async function initDurable(pgPool, lambdaRootDir) {
  pool = pgPool;
  lambdaRoot = lambdaRootDir;
  await pool.query(`CREATE TABLE IF NOT EXISTS durable_executions (
    arn TEXT PRIMARY KEY,
    function_name TEXT NOT NULL,
    input JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'RUNNING',
    output JSONB,
    error JSONB,
    checkpoint_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS durable_operations (
    arn TEXT NOT NULL,
    op_id TEXT NOT NULL,
    seq BIGSERIAL,
    op JSONB NOT NULL,
    PRIMARY KEY (arn, op_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS durable_callbacks (
    callback_id TEXT PRIMARY KEY,
    arn TEXT NOT NULL,
    op_id TEXT NOT NULL)`);
}

// --- store -----------------------------------------------------------------
const newArn = (fn) =>
  `arn:aws:lambda:${REGION}:${ACCOUNT}:durable-execution:${fn.split(':')[0]}:${crypto.randomUUID()}`;

const getOps = async (arn) => {
  const { rows } = await pool.query('SELECT op FROM durable_operations WHERE arn = $1 ORDER BY seq', [arn]);
  return rows.map((r) => r.op);
};

const getExecution = async (arn) => {
  const { rows } = await pool.query('SELECT * FROM durable_executions WHERE arn = $1', [arn]);
  return rows[0] || null;
};

// Apply a checkpoint batch: merge each update onto the stored op, derive Status
// from Action, mint CallbackIds for CALLBACK-START ops. Returns the full merged
// op records (what the SDK writes back into its local step data).
const applyCheckpoint = async (arn, updates = []) => {
  const changed = [];
  for (const update of updates) {
    const opId = update.Id;
    if (!opId) continue;
    const { rows } = await pool.query('SELECT op FROM durable_operations WHERE arn = $1 AND op_id = $2', [arn, opId]);
    const existing = rows[0]?.op || {};
    const op = { ...existing, ...update };
    if (update.Action && STATUS_FOR_ACTION[update.Action]) op.Status = STATUS_FOR_ACTION[update.Action];

    if (op.Type === 'CALLBACK' && update.Action === 'START' && !op.CallbackDetails?.CallbackId) {
      const callbackId = `cb-${crypto.randomUUID()}`;
      op.CallbackDetails = { ...(op.CallbackDetails || {}), CallbackId: callbackId };
      await pool.query(
        'INSERT INTO durable_callbacks (callback_id, arn, op_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [callbackId, arn, opId],
      );
    }

    await pool.query(
      `INSERT INTO durable_operations (arn, op_id, op) VALUES ($1, $2, $3)
       ON CONFLICT (arn, op_id) DO UPDATE SET op = $3`,
      [arn, opId, op],
    );
    changed.push(op);
  }
  return changed;
};

const resolveCallback = async (callbackId, { status, result, error }) => {
  const { rows } = await pool.query('SELECT arn, op_id FROM durable_callbacks WHERE callback_id = $1', [callbackId]);
  if (!rows[0]) return null;
  const { arn, op_id: opId } = rows[0];
  const cur = await pool.query('SELECT op FROM durable_operations WHERE arn = $1 AND op_id = $2', [arn, opId]);
  const op = cur.rows[0]?.op || {};
  op.Status = status;
  op.CallbackDetails = {
    ...(op.CallbackDetails || {}),
    ...(result !== undefined ? { Result: result } : {}),
    ...(error !== undefined ? { Error: error } : {}),
  };
  await pool.query('UPDATE durable_operations SET op = $3 WHERE arn = $1 AND op_id = $2', [arn, opId, op]);
  return { arn, opId };
};

// --- driver ----------------------------------------------------------------
const loadDurableHandler = async (functionName) => {
  const dir = DURABLE_FUNCTIONS.find((f) => functionName.includes(f)) || functionName;
  if (!handlerCache.has(dir)) {
    handlerCache.set(
      dir,
      import(path.join(lambdaRoot, dir, 'index.js')).then((m) => m.lambdaHandler || m.handler),
    );
  }
  return handlerCache.get(dir);
};

// Run one invoke of the wrapped handler, then interpret its terminal status.
// Serialized per arn so a callback-triggered re-invoke can't overlap a running one.
const runInvoke = async (arn, updatedOperationIds = []) => {
  const prev = runLocks.get(arn) || Promise.resolve();
  const next = prev.then(() => invokeOnce(arn, updatedOperationIds)).catch((e) => {
    console.error(`durable runInvoke ${arn} failed:`, e);
  });
  runLocks.set(arn, next);
  return next;
};

const invokeOnce = async (arn, updatedOperationIds) => {
  const exec = await getExecution(arn);
  if (!exec || !['RUNNING', 'PENDING'].includes(exec.status)) return;
  const handler = await loadDurableHandler(exec.function_name);
  const ops = await getOps(arn);
  const event = {
    ...exec.input,
    DurableExecutionArn: arn,
    CheckpointToken: exec.checkpoint_token,
    InitialExecutionState: { Operations: ops, NextMarker: '' },
    UpdatedOperationIds: updatedOperationIds,
  };
  let body;
  try {
    body = await handler(event, { awsRequestId: crypto.randomUUID() });
  } catch (e) {
    await pool.query(
      `UPDATE durable_executions SET status='FAILED', error=$2, ended_at=now() WHERE arn=$1`,
      [arn, { ErrorType: e.name, ErrorMessage: e.message }],
    );
    return;
  }
  const status = body?.Status || 'SUCCEEDED';
  if (status === 'SUCCEEDED') {
    await pool.query(`UPDATE durable_executions SET status='SUCCEEDED', output=$2, ended_at=now() WHERE arn=$1`, [
      arn,
      body?.Output ?? null,
    ]);
  } else if (status === 'FAILED') {
    await pool.query(`UPDATE durable_executions SET status='FAILED', error=$2, ended_at=now() WHERE arn=$1`, [
      arn,
      body?.Error ?? null,
    ]);
  } else {
    // PENDING: suspended on a callback/wait — leave RUNNING; a succeed re-invokes.
    await pool.query(`UPDATE durable_executions SET status='RUNNING' WHERE arn=$1`, [arn]);
  }
};

// Start a durable execution for a normal Invoke of a durability-enabled function.
export const startDurableExecution = async (functionName, input) => {
  const arn = newArn(functionName);
  const token = crypto.randomUUID();
  await pool.query(
    'INSERT INTO durable_executions (arn, function_name, input, checkpoint_token) VALUES ($1, $2, $3, $4)',
    [arn, functionName, input, token],
  );
  runInvoke(arn, []); // fire-and-forget; the loop suspends on the first callback
  return arn;
};

// --- REST plane (both runtime + control) -----------------------------------
// Returns { status, body } for a durable route, or null if the path isn't one.
export async function handleDurableRest(method, url, rawBody) {
  const u = new URL(url, 'http://x');
  const p = u.pathname;
  const body = rawBody ? JSON.parse(rawBody) : {};
  const json = (status, obj) => ({ status, body: obj });

  let m;
  // runtime plane -----------------------------------------------------------
  if ((m = p.match(/^\/2025-12-01\/durable-executions\/(.+)\/checkpoint$/))) {
    const arn = decodeURIComponent(m[1]);
    const changed = await applyCheckpoint(arn, body.Updates || []);
    return json(200, { CheckpointToken: body.CheckpointToken, NewExecutionState: { Operations: changed } });
  }
  if ((m = p.match(/^\/2025-12-01\/durable-executions\/(.+)\/state$/))) {
    const arn = decodeURIComponent(m[1]);
    return json(200, { Operations: await getOps(arn), NextMarker: '' });
  }
  // control plane -----------------------------------------------------------
  if ((m = p.match(/^\/2025-12-01\/durable-executions\/(.+)\/stop$/))) {
    const arn = decodeURIComponent(m[1]);
    await pool.query(`UPDATE durable_executions SET status='STOPPED', ended_at=now() WHERE arn=$1`, [arn]);
    return json(200, {});
  }
  if ((m = p.match(/^\/2025-12-01\/durable-execution-callbacks\/([^/]+)\/(succeed|fail|heartbeat)$/))) {
    const callbackId = decodeURIComponent(m[1]);
    const kind = m[2];
    if (kind === 'heartbeat') return json(200, {});
    const resolved = await resolveCallback(callbackId, {
      status: kind === 'succeed' ? 'SUCCEEDED' : 'FAILED',
      result: kind === 'succeed' ? (body.ResultPayload ?? body.Result ?? body) : undefined,
      error: kind === 'fail' ? (body.Error ?? body) : undefined,
    });
    if (!resolved) return json(404, { message: `callback ${callbackId} not found` });
    runInvoke(resolved.arn, [resolved.opId]); // resume
    return json(200, {});
  }
  if ((m = p.match(/^\/2025-12-01\/durable-executions\/([^/]+)$/))) {
    const arn = decodeURIComponent(m[1]);
    const e = await getExecution(arn);
    if (!e) return json(404, { message: 'not found' });
    return json(200, {
      DurableExecutionArn: e.arn,
      FunctionName: e.function_name,
      Status: e.status,
      Output: e.output ?? undefined,
      Error: e.error ?? undefined,
      CreatedAt: e.created_at,
      EndedAt: e.ended_at ?? undefined,
    });
  }
  if ((m = p.match(/^\/2025-12-01\/functions\/([^/]+)\/durable-executions$/))) {
    const fn = decodeURIComponent(m[1]);
    const { rows } = await pool.query(
      'SELECT arn, function_name, status, created_at FROM durable_executions WHERE function_name LIKE $1 ORDER BY created_at DESC LIMIT 100',
      [`%${fn}%`],
    );
    return json(200, {
      DurableExecutions: rows.map((r) => ({
        DurableExecutionArn: r.arn,
        FunctionName: r.function_name,
        Status: r.status,
        CreatedAt: r.created_at,
      })),
    });
  }
  return null; // not a durable route
}
