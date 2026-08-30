# jf-ai-dlc

The **AI-DLC methodology as an installable plugin** for **Claude Code** and
**Codex** — an open-source packaging of AWS's AI-DLC workflows (33 stages / 14
agents) that you drop into your own project.

This project **stands on the shoulders of giants**: the methodology is the work
of AWS Labs — jf-ai-dlc is a packaging/adapter layer, not a reimplementation.
See [docs/why.md](docs/why.md) for full credit.

> Looking for the **collaboration platform** (the shared, self-hosted server
> that runs AI-DLC as a team — realtime editing, approval gates, agent session
> orchestration)? That's the sibling repo
> **[jf-ai-dlc-collaboration](../jf-ai-dlc-collaboration)**. This repo is just
> the CLI plugin; it can point at a platform deployment via an optional MCP
> entry (`--with-collab`), but works standalone without one.

Built from one regularly-updated upstream, vendored via `git subtree` (pinned
ref in [UPSTREAM_VERSIONS.md](UPSTREAM_VERSIONS.md)):

| Upstream | What it provides | Docs (pinned version) |
|---|---|---|
| [awslabs/aidlc-workflows @ v2](https://github.com/awslabs/aidlc-workflows/tree/v2) | The AI-DLC methodology (33 stages / 14 agents), rendered as per-harness distributions for Claude Code and Codex | [docs](https://github.com/awslabs/aidlc-workflows/tree/v2/docs) |

## What you get

`plugins/claude` and `plugins/codex` are the ready-to-install distributions:

- **Claude Code** — `.claude/` (skills, agents, hooks, tools), the `aidlc/`
  workspace, and `.mcp.json`. Run `/aidlc <what you want to build>` after
  installing.
- **Codex** — `.codex/` + `.agents/` + `AGENTS.md` + the `aidlc/` workspace.

They are generated from the upstream `core/` sources with a few OSS transforms
(see *Local adjustments* below), and are rebuilt reproducibly by
`scripts/build-plugin.sh`.

## Repository layout

```
upstream/aidlc-workflows/   git subtree vendor — never hand-edit
plugins/claude, plugins/codex   the built, transformed distributions
scripts/                    build + install + update workflow
docs/                       topical documentation (see below)
```

## Scripts

| Script | What it does |
|---|---|
| `build-plugin.sh [claude\|codex\|both] [--check] [--from-dist]` | **Fully automatic core→plugin build.** Per harness: runs upstream's packager (`bun scripts/package.ts`, core→dist) then the OSS transforms (dist→plugin). `--check` adds the drift guard; `--from-dist` skips the rebuild (no `bun` needed). Handles the one-time `bun install`. |
| `vendor-plugins.mjs [claude\|codex]` | The dist→plugin transform step alone (strip AWS MCP servers; Codex→native OpenAI auth; write collab toggle templates). Called by `build-plugin.sh` and `update-upstream.sh`; run directly to re-apply transforms without rebuilding from core. |
| `install-plugin.sh <target-dir> claude\|codex\|both [--with-collab\|--no-collab]` | Installs a built plugin into a consuming project. Key-merges `.mcp.json`, appends `.gitignore`, and toggles the collab platform MCP entry. |
| `update-upstream.sh [<ref>]` | Pulls the `upstream/aidlc-workflows` subtree, re-vendors the plugins, and refreshes `UPSTREAM_VERSIONS.md`. |

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
applies the OSS transforms into `plugins/<harness>`. Step 1 needs `bun`; the
first run does a one-time `bun install` in the subtree. Use `--from-dist` to run
only step 2 when `bun` is unavailable. The transition is reproducible —
rebuilding from an unchanged `core/` yields byte-identical plugins.

**Install the plugin into a project**

```bash
scripts/install-plugin.sh <target-dir> claude|codex|both [--with-collab|--no-collab]
```

`--no-collab` (default) keeps smaller projects free of the collab platform
dependency; `--with-collab` merges the platform MCP entry into `.mcp.json`
(Claude) / `.codex/config.toml` (Codex, marker-delimited block) — point it at a
[jf-ai-dlc-collaboration](../jf-ai-dlc-collaboration) deployment. Re-running with
either flag toggles cleanly.

**Update the upstream**

```bash
scripts/update-upstream.sh [<ref>]      # bump aidlc-workflows, re-vendor plugins
```

## Local adjustments vs upstream

The plugins are the upstream `dist/{claude,codex}` with these OSS transforms
(`scripts/vendor-plugins.mjs`, applied on every build):

- **AWS MCP servers removed** from `plugins/claude/.mcp.json` (`aws-mcp`,
  `aws-pricing`, `aws-iac`, `aws-serverless`); `context7` kept.
- **Codex provider switched** from Amazon Bedrock to native OpenAI auth:
  `model_provider` and the `[model_providers.amazon-bedrock.aws]` block are
  commented out, Bedrock `openai.gpt-*` model IDs are de-prefixed everywhere
  (config, agent role files, `aidlc-tiers.ts`), and the AGENTS.md provider
  bullet is rewritten to match.
- **Collab toggle templates added** (`collab.mcp.json` / `collab-mcp.toml`),
  consumed by `install-plugin.sh --with-collab`.

Nothing under `upstream/` is hand-edited; the transforms run on the generated
distributions.

## Documentation

Deeper, topical docs live in [`docs/`](docs/):

- [Why this project exists](docs/why.md) — the problem it solves and full credit to the upstream projects.
- [Requirements & dependencies](docs/requirements.md) — the (small) host tooling needed to build and install the plugin.
- [Updating the upstream](docs/upstream-updates.md) — how to fetch a newer AI-DLC version.
- [Modifying upstream — the transform workflow](docs/local-adjustments.md) — how the OSS transforms keep `upstream/` pristine, and how to add or change one.
