# Pinned upstream version

<!-- machine-readable: do not change the table structure; scripts/update-upstream.sh rewrites it -->

| Prefix | Upstream | Ref | Commit | Vendored |
|---|---|---|---|---|
| `upstream/aidlc-workflows` | https://github.com/awslabs/aidlc-workflows | `v2` (branch) | `2fbee12fb29d2a6614b70b6f61f3cceeaf235245` | 2026-08-29 |

`upstream/aidlc-workflows` is a `git subtree --squash` vendor. Never hand-edit
it — the installable plugins are generated into `plugins/` by
`scripts/build-plugin.sh` / `scripts/vendor-plugins.mjs`.

To update, run `scripts/update-upstream.sh` (see README).

The collaboration platform (`aws-samples/sample-collaborative-ai-dlc`) is
vendored in the sibling repo **[jf-ai-dlc-collaboration](../jf-ai-dlc-collaboration)**
— this repo only vendors the AI-DLC methodology.
