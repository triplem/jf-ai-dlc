# Modifying upstream — the transform workflow

`upstream/aidlc-workflows/` is a **pristine `git subtree` vendor** of
[awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows). The README
says it plainly: **never hand-edit it.**

Unlike the sibling **jf-ai-dlc-collaboration** repo (which modifies upstream
*source* via [patches](../../jf-ai-dlc-collaboration/docs/patches.md)), this repo
never edits upstream source at all. The plugins are a **generated build
product**, so local adjustments are applied as **transforms** on that output —
re-run deterministically on every build — not as diffs against source.

## The build pipeline

`scripts/build-plugin.sh` runs two steps per harness:

```
core/ + harness/  ──(1) upstream packager──▶  dist/<harness>  ──(2) transforms──▶  plugins/<harness>
     (upstream, pristine)   bun scripts/package.ts              vendor-plugins.mjs   (committed, shipped)
```

1. **core → dist** — upstream's own packager (`bun scripts/package.ts <harness>`)
   regenerates `dist/<harness>` from the hand-authored `core/` + `harness/`
   sources. This is upstream's code; we don't touch it.
2. **dist → plugin** — `scripts/vendor-plugins.mjs` applies the OSS transforms
   into `plugins/<harness>`. **This is where every local adjustment lives.**

Because `dist/` is *generated*, patching it would be pointless (the next
packager run overwrites it). Transforms are **idempotent** and run on every
build, so they survive regeneration and upstream bumps.

## Current transforms

`scripts/vendor-plugins.mjs` (keep the README "Local adjustments vs upstream"
section in sync):

- **claude** — strip the AWS-specific MCP servers from `.mcp.json` (`aws-mcp`,
  `aws-pricing`, `aws-iac`, `aws-serverless`; `context7` stays); write the
  `collab.mcp.json` toggle template.
- **codex** — switch the `amazon-bedrock` model provider to native OpenAI auth
  (comment out `model_provider` + the `[model_providers.amazon-bedrock.aws]`
  block; de-prefix Bedrock `openai.gpt-*` ids across config / agent role files /
  `aidlc-tiers.ts`; rewrite the AGENTS.md provider bullet); write the
  `collab-mcp.toml` toggle template.

## Adding or changing a transform

```bash
# 1. edit the transform (keep it IDEMPOTENT — safe to re-run on any build)
$EDITOR scripts/vendor-plugins.mjs

# 2. document it in the README "Local adjustments vs upstream" section
$EDITOR README.md

# 3. rebuild both plugins and prove the build is reproducible (byte-identical)
scripts/build-plugin.sh both --check     # needs bun; or --from-dist to skip the core rebuild
git diff --stat plugins/                 # your transform's effect, and nothing else

# 4. commit the transform + the regenerated plugins/ together
git add scripts/vendor-plugins.mjs README.md plugins/
git commit -m "vendor: <what the transform does>"
```

Guidelines:

- **Idempotent, always.** The transform runs on every packager build and every
  subtree pull; running it twice must produce the same result. Prefer targeted
  edits (delete a known key, comment a known block) over broad rewrites.
- **Prefer a transform over a new file.** Toggle templates (`collab.mcp.json`,
  `collab-mcp.toml`) are the exception — they're additive artifacts consumed by
  `install-plugin.sh`, not modifications of upstream output.
- **Commit the rebuilt `plugins/`.** They're the shipped product; CI rebuilds
  and diffs them (see below), so a stale `plugins/` fails the build.

## The drift guard

The build is reproducible by design — rebuilding from an unchanged `core/`
yields byte-identical plugins. Two guards enforce it:

- `scripts/build-plugin.sh both --check` — verifies `dist/` matches `core/`
  (the packager is deterministic) before transforming.
- **CI** (`.github/workflows/ci.yml`): the `vendor` job re-runs
  `vendor-plugins.mjs` and fails on any `git diff` in `plugins/`; the
  `build-from-core` job rebuilds the whole `core → dist → plugin` chain and
  asserts byte-identical output. So a transform that wasn't committed with its
  regenerated `plugins/`, or that isn't reproducible, is caught in CI.

## Updating the upstream

`scripts/update-upstream.sh [<ref>]` pulls the `upstream/aidlc-workflows`
subtree, re-runs the transforms, and refreshes `UPSTREAM_VERSIONS.md` — upstream
stays pristine, the transforms re-apply on top. See
[Updating the upstream](upstream-updates.md).
