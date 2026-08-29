#!/usr/bin/env node
// Re-vendor plugins/{claude,codex} from upstream/aidlc-workflows/dist/.
//
// Applied transforms (each one is a documented local adjustment — keep the
// "Local adjustments" section of README.md in sync):
//   1. claude/.mcp.json      — strip AWS-specific MCP servers
//   2. codex/.codex/config.toml — switch amazon-bedrock provider to native
//      OpenAI auth (upstream documents this as the supported alternative)
//   3. add collab.* templates — the on/off collaboration MCP entries that
//      scripts/install-plugin.sh merges in with --with-collab
//
// Idempotent: run after every `git subtree pull` of upstream/aidlc-workflows.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'upstream/aidlc-workflows/dist');
const pluginsDir = path.join(root, 'plugins');

const AWS_MCP_SERVERS = ['aws-mcp', 'aws-pricing', 'aws-iac', 'aws-serverless'];

// --- 0. fresh copy of both dists -------------------------------------------
for (const harness of ['claude', 'codex']) {
  const dest = path.join(pluginsDir, harness);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(path.join(distDir, harness), dest, { recursive: true });
}

// --- 1. claude/.mcp.json: strip AWS MCP servers ----------------------------
const mcpPath = path.join(pluginsDir, 'claude/.mcp.json');
const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
const stripped = AWS_MCP_SERVERS.filter((name) => delete mcp.mcpServers[name]);
writeFileSync(mcpPath, `${JSON.stringify(mcp, null, 2)}\n`);

// --- 2. codex config.toml: bedrock → native OpenAI auth --------------------
// Upstream ships model_provider = "amazon-bedrock" and notes: "For OpenAI-auth
// setups, comment out model_provider and the [model_providers] block." We do
// exactly that, and drop the Bedrock "openai." model-ID prefix.
const tomlPath = path.join(pluginsDir, 'codex/.codex/config.toml');
const lines = readFileSync(tomlPath, 'utf8').split('\n');
let inBedrockBlock = false;
const out = lines.map((line) => {
  if (inBedrockBlock) {
    if (/^\[/.test(line) && !line.startsWith('[model_providers.amazon-bedrock')) {
      inBedrockBlock = false;
      return line;
    }
    return line === '' || line.startsWith('#') ? line : `# ${line}`;
  }
  if (/^model_provider\s*=\s*"amazon-bedrock"/.test(line)) {
    return `# ${line}  # jf-ai-dlc: native OpenAI auth instead of Bedrock`;
  }
  if (/^model\s*=\s*"openai\./.test(line)) {
    return line.replace('"openai.', '"');
  }
  if (line.startsWith('[model_providers.amazon-bedrock')) {
    inBedrockBlock = true;
    return `# ${line}`;
  }
  return line;
});
writeFileSync(tomlPath, out.join('\n'));

// Bedrock model IDs ("openai.gpt-…") are pinned in agent role files (.toml,
// .md frontmatter) and programmatically in .codex/tools/aidlc-tiers.ts —
// de-prefix them everywhere in the codex plugin for native OpenAI auth.
let deprefixed = 0;
const codexDir = path.join(pluginsDir, 'codex');
for (const entry of readdirSync(codexDir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.(toml|md|ts)$/.test(entry.name)) continue;
  const file = path.join(entry.parentPath, entry.name);
  const src = readFileSync(file, 'utf8');
  const replaced = src.replaceAll('openai.gpt-', 'gpt-');
  if (replaced !== src) {
    writeFileSync(file, replaced);
    deprefixed += 1;
  }
}

// AGENTS.md documents Bedrock as the shipped default — rewrite that bullet to
// match this distribution's native-OpenAI default.
const agentsMdPath = path.join(codexDir, 'AGENTS.md');
const agentsMd = readFileSync(agentsMdPath, 'utf8');
writeFileSync(
  agentsMdPath,
  agentsMd.replace(
    /^- \*\*Model provider\*\*:.*$/m,
    '- **Model provider**: This distribution (jf-ai-dlc) defaults to **native OpenAI auth** — the session (and judgment-tier agents, which inherit it) on `gpt-5.5`, balanced/templated agents pinned to `gpt-5.6-terra` (the tier projection). Sign in with your OpenAI account or set `OPENAI_API_KEY`. The upstream Amazon Bedrock provider block is preserved commented-out in `.codex/config.toml` for reference.',
  ),
);

// --- 3. collab toggle templates --------------------------------------------
// Merged into the consuming project by install-plugin.sh --with-collab and
// removed by --no-collab. COLLAB_MCP_URL points at a jf-ai-dlc platform
// deployment (endpoint provided by the compose/helm stacks).
writeFileSync(
  path.join(pluginsDir, 'claude/collab.mcp.json'),
  `${JSON.stringify(
    {
      mcpServers: {
        'collaborative-aidlc': {
          type: 'http',
          url: '${COLLAB_MCP_URL:-http://localhost:8080/mcp}',
        },
      },
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  path.join(pluginsDir, 'codex/collab-mcp.toml'),
  `# >>> jf-ai-dlc collab >>>
# Collab platform MCP entry — appended to .codex/config.toml by
# install-plugin.sh --with-collab, removed by --no-collab (via these markers).
[mcp_servers.collaborative-aidlc]
url = "http://localhost:8080/mcp"
# <<< jf-ai-dlc collab <<<
`,
);

console.log(`vendored plugins/claude, plugins/codex from ${path.relative(root, distDir)}`);
console.log(`  claude/.mcp.json: removed [${stripped.join(', ')}]`);
console.log(
  `  codex/.codex/config.toml: bedrock provider commented out; model IDs de-prefixed (${deprefixed} agent files)`,
);
console.log('  wrote collab toggle templates (claude/collab.mcp.json, codex/collab-mcp.toml)');
