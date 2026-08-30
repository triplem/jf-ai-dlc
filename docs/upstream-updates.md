# Updating the upstream

The AI-DLC methodology (`aidlc-workflows`) releases regularly. This repo is
structured so pulling a newer version and re-generating the plugins is a single
scripted step.

## The vendoring model

The upstream is vendored with **`git subtree --squash`**:

```
upstream/aidlc-workflows/   # awslabs/aidlc-workflows
```

**Never hand-edit anything under `upstream/`.** The installable plugins in
`plugins/{claude,codex}` are *generated* from the upstream `dist/` by
`scripts/vendor-plugins.mjs` (which applies the OSS transforms — see the root
[`README.md`](../README.md)). The exact pinned ref and commit are in
[`../UPSTREAM_VERSIONS.md`](../UPSTREAM_VERSIONS.md) (today: `aidlc-workflows` @
`v2`).

> The collaboration platform (`aws-samples/sample-collaborative-ai-dlc`) is
> updated separately in the sibling repo
> [jf-ai-dlc-collaboration](../../jf-ai-dlc-collaboration).

## The update command

```bash
scripts/update-upstream.sh            # re-sync the current ref (no-op drill)
scripts/update-upstream.sh <ref>      # bump aidlc-workflows to a branch/tag
```

It requires a **clean working tree** and, in order:

1. **`git subtree pull --squash`** `upstream/aidlc-workflows` at the requested
   ref (defaults to the current pin read from `UPSTREAM_VERSIONS.md`).
2. **Re-vendors the plugins** via `scripts/vendor-plugins.mjs` (`plugins/claude`,
   `plugins/codex` with the OSS transforms re-applied).
3. **Refreshes `UPSTREAM_VERSIONS.md`** with the new commit and date.

Then verify the plugins still build reproducibly from `core/`:

```bash
scripts/build-plugin.sh both --check
```

## The no-op drill

Run `scripts/update-upstream.sh` with **no arguments** (re-pinning the same ref)
at any time. It must produce **zero diff** — that proves the vendor pipeline is
deterministic before you attempt a real version bump. If it's not a no-op, fix
that first.

## Rebuilding the plugins from core

`update-upstream.sh` re-vendors the plugins from the committed `dist/`. To
rebuild them from the hand-authored `core/` instead (e.g. to verify
reproducibility after a bump):

```bash
scripts/build-plugin.sh              # both harnesses: core → dist → plugin
scripts/build-plugin.sh claude       # just Claude Code
scripts/build-plugin.sh codex        # just Codex
scripts/build-plugin.sh both --check # + drift-guard dist against core
scripts/build-plugin.sh --from-dist  # skip the core rebuild (no Bun needed)
```

The core → dist step uses upstream's own packager (`bun scripts/package.ts`), so
it needs [Bun](https://bun.sh); `--from-dist` transforms the already-vendored
`dist/` without it.
