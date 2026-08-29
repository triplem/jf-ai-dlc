#!/usr/bin/env node
// Transform upstream/aidlc-workflows/dist/<harness> into plugins/<harness>.
//
//   node scripts/vendor-plugins.mjs                # both harnesses
//   node scripts/vendor-plugins.mjs claude         # just claude
//   node scripts/vendor-plugins.mjs codex          # just codex
//
// This is the dist→plugin half of the core→plugin transition; the core→dist
// half is upstream's own packager, driven by scripts/build-plugin.sh.
//
// Applied transforms (each one is a documented local adjustment — keep the
// "Local adjustments" section of README.md in sync):
//   claude: strip AWS-specific MCP servers from .mcp.json; write collab toggle
//   codex:  switch amazon-bedrock provider to native OpenAI auth (upstream
//           documents this as the supported alternative); write collab toggle
//
// Idempotent: safe to re-run after every packager build or subtree pull.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'upstream/aidlc-workflows/dist');
const pluginsDir = path.join(root, 'plugins');

const AWS_MCP_SERVERS = ['aws-mcp', 'aws-pricing', 'aws-iac', 'aws-serverless'];

const freshCopy = (harness) => {
  const dest = path.join(pluginsDir, harness);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(path.join(distDir, harness), dest, { recursive: true });
  return dest;
};

function vendorClaude() {
  const dest = freshCopy('claude');

  // .mcp.json: strip AWS MCP servers (context7 stays)
  const mcpPath = path.join(dest, '.mcp.json');
  const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
  const stripped = AWS_MCP_SERVERS.filter((name) => delete mcp.mcpServers[name]);
  writeFileSync(mcpPath, `${JSON.stringify(mcp, null, 2)}\n`);

  // collab toggle template (merged by install-plugin.sh --with-collab)
  writeFileSync(
    path.join(dest, 'collab.mcp.json'),
    `${JSON.stringify(
      { mcpServers: { 'collaborative-aidlc': { type: 'http', url: '${COLLAB_MCP_URL:-http://localhost:8080/mcp}' } } },
      null,
      2,
    )}\n`,
  );

  console.log('plugins/claude:');
  console.log(`  .mcp.json: removed [${stripped.join(', ')}]`);
  console.log('  wrote collab.mcp.json toggle template');
}

function vendorCodex() {
  const dest = freshCopy('codex');

  // config.toml: amazon-bedrock provider → native OpenAI auth.
  // Upstream notes: "For OpenAI-auth setups, comment out model_provider and the
  // [model_providers] block." We do exactly that and drop the "openai." prefix.
  const tomlPath = path.join(dest, '.codex/config.toml');
  let inBedrockBlock = false;
  const toml = readFileSync(tomlPath, 'utf8')
    .split('\n')
    .map((line) => {
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
      if (/^model\s*=\s*"openai\./.test(line)) return line.replace('"openai.', '"');
      if (line.startsWith('[model_providers.amazon-bedrock')) {
        inBedrockBlock = true;
        return `# ${line}`;
      }
      return line;
    });
  writeFileSync(tomlPath, toml.join('\n'));

  // Bedrock model IDs are also pinned in agent role files (.toml, .md) and in
  // .codex/tools/aidlc-tiers.ts — de-prefix them everywhere in the plugin.
  let deprefixed = 0;
  for (const entry of readdirSync(dest, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(toml|md|ts)$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const src = readFileSync(file, 'utf8');
    const replaced = src.replaceAll('openai.gpt-', 'gpt-');
    if (replaced !== src) {
      writeFileSync(file, replaced);
      deprefixed += 1;
    }
  }

  // AGENTS.md documents Bedrock as the default — rewrite that bullet.
  const agentsMdPath = path.join(dest, 'AGENTS.md');
  const agentsMd = readFileSync(agentsMdPath, 'utf8');
  writeFileSync(
    agentsMdPath,
    agentsMd.replace(
      /^- \*\*Model provider\*\*:.*$/m,
      '- **Model provider**: This distribution (jf-ai-dlc) defaults to **native OpenAI auth** — the session (and judgment-tier agents, which inherit it) on `gpt-5.5`, balanced/templated agents pinned to `gpt-5.6-terra` (the tier projection). Sign in with your OpenAI account or set `OPENAI_API_KEY`. The upstream Amazon Bedrock provider block is preserved commented-out in `.codex/config.toml` for reference.',
    ),
  );

  // collab toggle template (appended by install-plugin.sh --with-collab)
  writeFileSync(
    path.join(dest, 'collab-mcp.toml'),
    `# >>> jf-ai-dlc collab >>>
# Collab platform MCP entry — appended to .codex/config.toml by
# install-plugin.sh --with-collab, removed by --no-collab (via these markers).
[mcp_servers.collaborative-aidlc]
url = "http://localhost:8080/mcp"
# <<< jf-ai-dlc collab <<<
`,
  );

  console.log('plugins/codex:');
  console.log(`  .codex/config.toml: bedrock provider commented out; model IDs de-prefixed (${deprefixed} files)`);
  console.log('  wrote collab-mcp.toml toggle template');
}

const vendors = { claude: vendorClaude, codex: vendorCodex };
const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const harnesses = requested.length ? requested : ['claude', 'codex'];

for (const harness of harnesses) {
  if (!vendors[harness]) {
    console.error(`vendor-plugins: unknown harness "${harness}" (want claude|codex)`);
    process.exit(1);
  }
  vendors[harness]();
}
