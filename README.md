# jf-ai-dlc

An open-source, self-hosted port of the **AI-DLC v2** methodology and the
**Collaborative AI-DLC** platform. All AWS services are replaced with OSS
components: Docker Compose for testing, Kubernetes (Helm) for production.

Built from two regularly-updated upstreams, vendored via `git subtree`
(pinned refs in [UPSTREAM_VERSIONS.md](UPSTREAM_VERSIONS.md)):

| Upstream | What it provides | Docs (pinned version) |
|---|---|---|
| [awslabs/aidlc-workflows @ v2](https://github.com/awslabs/aidlc-workflows/tree/v2) | The AI-DLC methodology (33 stages / 14 agents), rendered as per-harness distributions for Claude Code and Codex | [docs](https://github.com/awslabs/aidlc-workflows/tree/v2/docs) |
| [aws-samples/sample-collaborative-ai-dlc @ v2.0.0](https://github.com/aws-samples/sample-collaborative-ai-dlc/tree/v2.0.0) | The collaboration platform: shared intents, approval gates, realtime editing, agent session orchestration | [docs](https://github.com/aws-samples/sample-collaborative-ai-dlc/tree/v2.0.0/docs) |

## System overview

```
                       ┌────────────────────────────────────────────────┐
                       │                 consuming project              │
                       │  plugins/claude (.claude/, aidlc/, .mcp.json)  │
                       │  plugins/codex  (.codex/, .agents/, AGENTS.md) │
                       └───────────────┬────────────────────────────────┘
                                       │ optional collab MCP entry — the on/off switch
                                       ▼
  frontend (SPA) ──► api-router ──► upstream lambda handlers (in-process)
        │                │                │           │
        │                ▼                ▼           ▼
        │           Keycloak         dynamo-pg     Gremlin Server /
        │           (OIDC)          (DynamoDB on    JanusGraph
        │                            PostgreSQL)   (graph/traceability)
        ▼
  ws-gateway ◄── ws-fanout          SeaweedFS (S3 API: artifacts, attachments)
  yjs-server (realtime docs)        aws-shim (SSM/Secrets on PostgreSQL,
                                             Lambda invoke, Cognito→Keycloak)
                                    session-runner ──► agentcore containers
                                    (compose: docker / k8s: Deployment)
                                    inference: direct Anthropic/OpenAI keys
```

## AWS → OSS mapping

| AWS service (upstream) | Replacement here | How |
|---|---|---|
| DynamoDB | `overlay/dynamo-pg` | wire-compatible server (dynalite + a Postgres abstract-level store + TransactWriteItems front); endpoint env only, upstream code unchanged |
| Neptune (Gremlin) | Gremlin Server (compose) / JanusGraph (k8s) | env: `NEPTUNE_ENDPOINT`, `GREMLIN_PORT`, `GREMLIN_PROTOCOL` |
| S3 | SeaweedFS | `AWS_ENDPOINT_URL_S3` + a `<bucket>.seaweedfs` network alias for virtual-host addressing |
| Cognito (authorizer) | Keycloak + `overlay/api-router` | router verifies OIDC tokens (JWKS) and projects claims onto the Cognito names handlers read (`sub`, `email`, `cognito:username`, `cognito:groups`, `custom:display_name`) |
| Cognito (admin API) | Keycloak Admin API via `overlay/aws-shim` | ListUsers / ListUsersInGroup / AdminGetUser / AdminAdd(Remove)UserToGroup mapped onto realm users + groups |
| API Gateway (HTTP) | `overlay/api-router` | route table generated from the upstream terraform by `scripts/gen-routes.mjs` (164 routes / 23 lambdas); handlers run in-process |
| API Gateway (WebSocket) | `overlay/ws-gateway` | drives `ws-connection` / `ws-message` in-process + serves the `@connections` management API `ws-fanout` targets |
| Lambda (as compute) | long-running containers | one shared image, per-service commands |
| Lambda (Invoke API) | `overlay/aws-shim` | in-process dispatch to the handler whose directory name appears in the function name |
| SSM + Secrets Manager | `overlay/aws-shim` | Postgres-persisted (runtime `PutParameter`/`PutSecretValue` writes survive restarts) |
| Bedrock AgentCore | `overlay/session-runner` | serves the `InvokeAgentRuntime` wire protocol; backends: shared runtime (`http`) or docker container-per-session; the upstream agentcore image runs unmodified |
| Bedrock inference | direct Anthropic / OpenAI API keys | env/secrets into the agentcore container. **LiteLLM later**: point the CLI base-URL envs at a LiteLLM deployment — no code change |
| Pricing API | stub in `overlay/aws-shim` | returns an empty price list; cost estimates degrade gracefully |
| CloudFront + S3 hosting | static frontend container behind ingress | *frontend not yet wired — see Known gaps* |
| Secrets Manager (deploy-time) | compose env / k8s Secrets | `existingSecret` in the Helm chart |

## Repository layout

```
upstream/            git subtree vendors — never hand-edit
overlay/             all local code
  dynamo-pg/         DynamoDB-on-Postgres server (has its own test suite)
  api-router/        API Gateway replacement (+ generated routes.json)
  ws-gateway/        WebSocket gateway + @connections mgmt API
  aws-shim/          SSM/Secrets/Lambda/Pricing/Cognito-IDP shim
  session-runner/    AgentCore control-plane replacement
  bootstrap/         table/bucket creation (+ generated tables.json)
  oracle/            runs the upstream vitest suite against dynamo-pg
  patches/           in-tree diffs (currently none)
plugins/             vendored aidlc dists for Claude Code + Codex (transformed)
deploy/compose/      full test stack        deploy/helm/jf-ai-dlc/  prod chart
scripts/             generators + installers + update workflow
```

## Scripts

All scripts are safe to re-run (idempotent) and live in `scripts/` unless noted.

| Script | What it does |
|---|---|
| `build-plugin.sh [claude\|codex\|both] [--check] [--from-dist]` | **Fully automatic core→plugin build.** Per harness: runs upstream's packager (`bun scripts/package.ts`, core→dist) then the OSS transforms (dist→plugin). `--check` adds the drift guard; `--from-dist` skips the rebuild (no `bun` needed). Handles the one-time `bun install`. |
| `vendor-plugins.mjs [claude\|codex]` | The dist→plugin transform step alone (strip AWS MCP servers; Codex→native OpenAI auth; write collab toggle templates). Called by `build-plugin.sh` and `update-upstream.sh`; run directly to re-apply transforms without rebuilding from core. |
| `install-plugin.sh <target-dir> claude\|codex\|both [--with-collab\|--no-collab]` | Installs a built plugin into a consuming project. Key-merges `.mcp.json`, appends `.gitignore`, and toggles the collab platform MCP entry. |
| `gen-routes.mjs` | Parses the upstream terraform API module into `overlay/api-router/routes.json` (164 routes / 23 lambdas). Re-run after every upstream update. |
| `gen-tables.mjs` | Parses every `aws_dynamodb_table` in the upstream terraform into `overlay/bootstrap/tables.json` (14 tables + GSIs). Re-run after every upstream update. |
| `update-upstream.sh [--aidlc <ref>] [--collab <ref>]` | Pulls the subtrees, re-applies `overlay/patches/`, regenerates routes/tables/plugins, runs the adapter tests, and refreshes `UPSTREAM_VERSIONS.md`. |
| `overlay/bootstrap/bootstrap.mjs` | One-shot stack bootstrap — creates the DynamoDB tables (from `tables.json`) and S3 buckets. Run as the `bootstrap` compose service or the Helm bootstrap Job. |

`build-plugin.sh` requires `bun` for the core→dist rebuild
(`curl -fsSL https://bun.sh/install | bash`); everything else runs on `node`.

## Usage

**Build the plugins from core (core → Claude / Codex plugin)**

```bash
scripts/build-plugin.sh                 # both harnesses
scripts/build-plugin.sh claude          # just the Claude Code plugin
scripts/build-plugin.sh codex           # just the Codex plugin
scripts/build-plugin.sh both --check    # verify dist matches core, then transform
scripts/build-plugin.sh --from-dist     # skip the core rebuild; transform committed dist only
```

Two steps run automatically per harness: (1) upstream's own packager
(`bun scripts/package.ts <harness>`) regenerates `dist/<harness>` from the
hand-authored `core/` + `harness/` sources, then (2) `vendor-plugins.mjs`
applies the OSS transforms into `plugins/<harness>`. Step 1 needs `bun`
(`curl -fsSL https://bun.sh/install | bash`); the first run does a one-time
`bun install` in the subtree. Use `--from-dist` to run only step 2 when `bun`
is unavailable. The transition is reproducible — rebuilding from an unchanged
`core/` yields byte-identical plugins.

**Install the AI-DLC plugin into a project**

```bash
scripts/install-plugin.sh <target-dir> claude|codex|both [--with-collab|--no-collab]
```

`--no-collab` (default) keeps smaller projects free of the collab platform
dependency; `--with-collab` merges the platform MCP entry into `.mcp.json`
(Claude) / `.codex/config.toml` (Codex, marker-delimited block). Re-running
with either flag toggles cleanly.

**Run the test stack**

```bash
cd deploy/compose
docker compose up -d                  # infra + platform
docker compose run --rm bootstrap     # idempotent: tables + buckets
# with agents (needs ANTHROPIC_API_KEY / OPENAI_API_KEY in .env):
docker compose --profile agents up -d
```

Smoke check (all verified working):

```bash
TOKEN=$(curl -s http://localhost:8081/realms/jf-ai-dlc/protocol/openid-connect/token \
  -d 'grant_type=password&client_id=jf-ui&username=alice&password=password' \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/projects
```

Endpoints: API `:3001` · WebSocket `:3002` · Keycloak `:8081` (admin/admin) ·
dynamo-pg `:8000` · Gremlin `:8182` · S3 `:8333` · yjs `:1234`.

**Deploy to Kubernetes**

Install the stateful infra first (CloudNativePG Postgres with `dynamo` + `shim`
databases, Keycloak with the realm from `deploy/compose/keycloak-realm.json`,
JanusGraph, SeaweedFS with S3 gateway), then:

```bash
helm install jf-ai-dlc deploy/helm/jf-ai-dlc -f your-values.yaml
```

**Update the upstreams**

```bash
scripts/update-upstream.sh [--aidlc <ref>] [--collab <ref>]
```

Pulls the subtrees, re-applies `overlay/patches/`, regenerates
`routes.json`/`tables.json`/`plugins/`, runs the adapter tests, and refreshes
`UPSTREAM_VERSIONS.md`. Then run the **oracle** (the full upstream test suite
against our adapters) before committing:

```bash
cd upstream/collab && npm ci && npx vitest run -c ../../overlay/oracle/vitest.config.js
```

## Local adjustments vs upstream

Everything that differs from upstream, in one place:

### Plugin transforms (`scripts/vendor-plugins.mjs`, via `build-plugin.sh`, applied on every update)
- **AWS MCP servers removed** from `plugins/claude/.mcp.json` (`aws-mcp`,
  `aws-pricing`, `aws-iac`, `aws-serverless`); `context7` kept.
- **Codex provider switched** from Amazon Bedrock to native OpenAI auth:
  `model_provider` and the `[model_providers.amazon-bedrock.aws]` block are
  commented out, Bedrock `openai.gpt-*` model IDs are de-prefixed everywhere
  (config, agent role files, `aidlc-tiers.ts`), and the AGENTS.md provider
  bullet is rewritten to match.
- **Collab toggle templates added** (`collab.mcp.json` / `collab-mcp.toml`),
  consumed by `install-plugin.sh`.

### Behavioral adjustments (no upstream code modified)
- **ws-authorizer is bypassed**: it is Cognito-specific (`aws-jwt-verify`);
  `ws-gateway` verifies Keycloak tokens itself and synthesizes the same
  `authorizer: { userId, userName }` context.
- **Issuer split**: tokens carry the public issuer (`OIDC_ISSUER`) while JWKS
  are fetched in-network (`OIDC_JWKS_URL`); Keycloak is pinned via
  `KC_HOSTNAME` so `iss` is stable.
- **Pricing** returns an empty price list (no OSS pricing source).
- **dynamo-pg is single-writer** (like DynamoDB Local): run exactly one
  replica. `TransactWriteItems` is implemented as serialized conditional ops
  with snapshot rollback (`ConditionCheck` transact items are not supported —
  upstream doesn't use them).
- **ws-gateway holds connections in-process**: one replica unless sticky
  routing per connection is added.

### In-tree patches (`overlay/patches/`)
- none currently.

## Verification status

- `overlay/dynamo-pg` test suite: 7/7 green (CRUD, GSI query, conditional
  writes, transaction commit/cancel + rollback, restart persistence).
- **Oracle**: full upstream vitest suite against dynamo-pg + Gremlin Server:
  **2459/2461 pass** — the 2 failures are pre-existing environment issues
  (`bunx tsc` sensor integration tests) that fail identically with upstream's
  own DynamoDB Local setup.
- Compose e2e smoke: Keycloak login → `POST /api/projects` 201 →
  `GET /api/projects` returns the project with `userRole: owner`
  (DynamoDB + graph writes both exercised).
- Helm: `helm lint` clean, `helm template` renders 16 resources.

## Known gaps

- **Frontend**: `upstream/collab/frontend` authenticates with `aws-amplify`
  (Cognito-only). The OIDC (Keycloak) shim patch is the next planned change;
  until then the platform is API-complete but has no web UI in the stack.
- **session-runner k8s backend**: prod currently uses the shared-runtime
  (`http`) backend against an agentcore Deployment; a Jobs-per-session backend
  is planned.
- **v2-orchestrator / durable executions** run through the same adapters but
  have not been exercised end-to-end with a live agent stage yet (requires
  provider API keys and `--profile agents`).
