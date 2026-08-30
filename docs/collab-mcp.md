# Connecting to the collaboration platform (MCP)

By default the plugin is **standalone** — the AI-DLC stages run entirely in your
local Claude Code / Codex with no server. To drive a shared,
[self-hosted collaboration platform](../../jf-ai-dlc-collaboration) instead
(realtime editing, approval gates, agent-session orchestration), the plugin adds
one **MCP server entry**, `collaborative-aidlc`, that points your CLI at a
platform deployment.

This page documents that entry: what it looks like per harness, how the
installer toggles it, and how to aim it at your own deployment.

!!! note "Optional by design"
    The default install is `--no-collab`. Everything works without the platform;
    the entry only matters if you actually run one and want your local CLI to
    participate in it.

## The entry, per harness

### Claude Code — `.mcp.json`

```json
{
  "mcpServers": {
    "collaborative-aidlc": {
      "type": "http",
      "url": "${COLLAB_MCP_URL:-http://localhost:8080/mcp}"
    }
  }
}
```

An HTTP MCP server. The URL uses shell-style expansion: it takes
`$COLLAB_MCP_URL` if set, otherwise falls back to `http://localhost:8080/mcp`
(a local deployment).

### Codex — `.codex/config.toml`

```toml
# >>> jf-ai-dlc collab >>>
[mcp_servers.collaborative-aidlc]
url = "http://localhost:8080/mcp"
# <<< jf-ai-dlc collab <<<
```

The `# >>> jf-ai-dlc collab >>>` / `# <<< … <<<` markers delimit the block so the
installer can add or remove it cleanly. Codex has no env-var expansion here —
edit the `url` directly for a non-local deployment.

## Toggling it with the installer

`install-plugin.sh` manages the entry for you; the flag is the third argument
(default `--no-collab`):

```bash
# add the entry (point the CLI at a platform)
scripts/install-plugin.sh <target-dir> claude|codex|both --with-collab

# remove it (keep the project standalone) — this is the default
scripts/install-plugin.sh <target-dir> claude|codex|both --no-collab
```

What each flag does:

| Flag | Claude Code | Codex |
|---|---|---|
| `--with-collab` | key-merges the `collaborative-aidlc` entry into the project's `.mcp.json` | appends the marker block to `.codex/config.toml` |
| `--no-collab` (default) | deletes the `collaborative-aidlc` key from `.mcp.json` if present | strips the marker block from `.codex/config.toml` if present |

The operation is idempotent and reversible: re-running with the other flag flips
the state, and your other MCP servers / config are untouched (the Claude side
key-merges; the Codex side only ever touches its own marker block).

## Pointing at your deployment

The shipped default, `http://localhost:8080/mcp`, assumes a platform running on
localhost. For any other deployment, set the endpoint to wherever that platform
serves its MCP endpoint.

**Claude Code** — set the env var, no file edit needed thanks to the
`${COLLAB_MCP_URL:-…}` fallback:

```bash
export COLLAB_MCP_URL="https://aidlc.internal.example.com/mcp"
```

**Codex** — edit the `url` inside the marker block in `.codex/config.toml`:

```toml
# >>> jf-ai-dlc collab >>>
[mcp_servers.collaborative-aidlc]
url = "https://aidlc.internal.example.com/mcp"
# <<< jf-ai-dlc collab <<<
```

!!! warning "The endpoint is deployment-specific"
    The URL must match how *your* platform instance exposes MCP; there is no
    single canonical port. The default `:8080/mcp` is a placeholder for a local
    deployment. The template ships **no auth header** — if your deployment
    fronts MCP with Keycloak or another gateway, add the credentials your
    deployment requires (e.g. via the harness's MCP header/auth support) rather
    than exposing the endpoint unauthenticated.

## How this relates to the platform's own MCP server

Don't confuse this **client** entry with the MCP server that runs *inside* the
platform. When the platform executes a stage, its `agentcore` runtime spawns a
headless CLI wired to an internal **stdio** MCP server (`name: aidlc`) — the
write path into the shared business graph. That server is an implementation
detail of the platform and is not something you configure here. The
`collaborative-aidlc` entry documented on this page is only the **outward**
connection: your local CLI → a platform deployment. See the
[jf-ai-dlc-collaboration](../../jf-ai-dlc-collaboration) repo for the internal
side.
