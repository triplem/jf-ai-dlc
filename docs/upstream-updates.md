# Updating the upstreams

Both upstream projects release regularly. jf-ai-dlc is structured so pulling a
newer version of **AI-DLC** (`aidlc-workflows`) or **Collaborative AI-DLC**
(`collab`) is a single scripted step that re-derives everything downstream.

## The vendoring model

The upstreams are vendored with **`git subtree --squash`**:

```
upstream/aidlc-workflows/   # awslabs/aidlc-workflows
upstream/collab/            # aws-samples/sample-collaborative-ai-dlc
```

**Never hand-edit anything under `upstream/`.** All local code lives outside it:

- `overlay/` — the adapter services (dynamo-pg, api-router, ws-gateway,
  aws-shim, session-runner, bootstrap, frontend, oracle). These wrap the
  upstream code by endpoint/config, not by editing it.
- `overlay/patches/*.patch` — the rare, unavoidable in-tree edits, applied on
  top of the subtree after every pull. (Currently empty.)

Because the diff against upstream is confined to `overlay/`, an update is
mostly "pull the new subtree and regenerate the derived artifacts." The exact
pinned refs and commits are in [`../UPSTREAM_VERSIONS.md`](../UPSTREAM_VERSIONS.md)
(today: `aidlc-workflows` @ `v2`, `collab` @ `v2.0.0`).

## The update command

```bash
scripts/update-upstream.sh                       # re-sync the current refs (no-op drill)
scripts/update-upstream.sh --aidlc <ref>         # bump aidlc-workflows to a branch/tag
scripts/update-upstream.sh --collab <ref>        # bump collab to a branch/tag
scripts/update-upstream.sh --aidlc <ref> --collab <ref>   # bump both
```

It requires a **clean working tree** (commit or stash first) and, in order:

1. **`git subtree pull --squash`** each upstream at the requested ref (defaults
   to the current pin read from `UPSTREAM_VERSIONS.md`).
2. **Re-applies `overlay/patches/*.patch`** with `git apply --3way`. On a
   conflict it **fails loudly**, naming the patch — see below.
3. **Regenerates the terraform-derived artifacts**: `scripts/gen-routes.mjs`
   (→ `overlay/api-router/routes.json`) and `scripts/gen-tables.mjs`
   (→ `overlay/bootstrap/tables.json`), so new API routes and DynamoDB tables
   come across automatically.
4. **Re-vendors the plugins** via `scripts/vendor-plugins.mjs`
   (`plugins/claude`, `plugins/codex` with the OSS transforms re-applied).
5. **Runs the dynamo-pg adapter test suite** as a fast sanity gate.
6. **Refreshes `UPSTREAM_VERSIONS.md`** with the new commits and date.

It then prints a checklist:

```
1. review the changes:            git diff --cached
2. run the oracle suite:          cd upstream/collab && npm ci && npx vitest run -c ../../overlay/oracle/vitest.config.js
3. rebuild + smoke the stack:     cd deploy/compose && docker compose build && docker compose up -d
4. commit:                        git commit -m "Update upstreams (aidlc: <ref>, collab: <ref>)"
```

The **oracle** (step 2) is the important gate: it runs the upstream project's
own vitest suite against the OSS substitutions (dynamo-pg + Gremlin Server), so
a passing run proves the new upstream still works on this stack.

## The no-op drill

Run `scripts/update-upstream.sh` with **no arguments** (re-pinning the same
refs) at any time. It must produce **zero diff** — that proves the whole
regenerate pipeline is deterministic before you attempt a real version bump. If
it's not a no-op, fix that first.

## Handling a patch conflict

If step 2 reports a conflict, an entry in `overlay/patches/` no longer applies
because upstream changed the code it patched. Resolve it manually against the
newly pulled `upstream/**`, regenerate the `.patch` from the fixed tree, and
re-run the update. A whole-file overlay (like the frontend auth swap, which is
a Vite-time module redirect rather than a patch) doesn't go through this path.

## Rebuilding the plugins from core

`update-upstream.sh` re-vendors the plugins from the committed `dist/`. To
rebuild them from the hand-authored `core/` instead (e.g. after editing core, or
to verify reproducibility):

```bash
scripts/build-plugin.sh              # both harnesses: core → dist → plugin
scripts/build-plugin.sh claude       # just Claude Code
scripts/build-plugin.sh codex        # just Codex
scripts/build-plugin.sh both --check # + drift-guard dist against core
scripts/build-plugin.sh --from-dist  # skip the core rebuild (no Bun needed)
```

The core → dist step uses upstream's own packager (`bun scripts/package.ts`), so
it needs [Bun](https://bun.sh); `--from-dist` transforms the already-vendored
`dist/` without it. See the root [`README.md`](../README.md) for the plugin
transforms these apply.
