# Requirements & dependencies

This repo just builds and installs the AI-DLC **plugin**, so the host tooling is
minimal — there are no runtime services to stand up (that's the sibling
[jf-ai-dlc-collaboration](../../jf-ai-dlc-collaboration) platform).

## Host tooling

| Tool | Version | Why it's needed | Homepage | License |
|---|---|---|---|---|
| git | current | The upstream is vendored via `git subtree`; updates use it (see [Updating the upstream](upstream-updates.md)). | https://git-scm.com | GPL-2.0 |
| Node.js | 22.x | Runs the `scripts/*.mjs` transforms and `install-plugin.sh` helpers. | https://nodejs.org | MIT / others |
| Bun | ≥ 1.3 | Only for the core→dist rebuild in `scripts/build-plugin.sh` (upstream's packager, `bun scripts/package.ts`). Use `build-plugin.sh --from-dist` to skip it and transform the committed `dist/` with `node` alone. | https://bun.sh | MIT |

## What the plugin needs at runtime (in your project)

Once installed into a project, the plugin runs inside your agent CLI:

- **Claude Code** or **Codex** — the harness that reads the installed `.claude/`
  / `.codex/` distribution and runs `/aidlc`.
- **Bun** — the AI-DLC tools and hooks run on `bun` inside the harness (see the
  installed `CLAUDE.md` / `AGENTS.md` prerequisites).
- **A model provider** — Claude Code uses your Anthropic auth; the Codex plugin
  is configured for native OpenAI auth (set `OPENAI_API_KEY` or sign in).
- **`context7`** MCP (optional) — reads `CONTEXT7_API_KEY` if present.

## Pinned upstream version

The vendored upstream and its exact commit are recorded in
[`../UPSTREAM_VERSIONS.md`](../UPSTREAM_VERSIONS.md). It is consumed as source
(vendored under `upstream/aidlc-workflows/`), not installed as a package.
