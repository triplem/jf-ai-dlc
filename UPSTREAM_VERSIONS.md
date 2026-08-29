# Pinned upstream versions

<!-- machine-readable: do not change the table structure; scripts/update-upstream.sh rewrites it -->

| Prefix | Upstream | Ref | Commit | Vendored |
|---|---|---|---|---|
| `upstream/aidlc-workflows` | https://github.com/awslabs/aidlc-workflows | `v2` (branch) | `2fbee12fb29d2a6614b70b6f61f3cceeaf235245` | 2026-08-29 |
| `upstream/collab` | https://github.com/aws-samples/sample-collaborative-ai-dlc | `v2.0.0` (tag) | `4d24d7174ae53d790e593486f2128f15ee75136f` | 2026-08-29 |

Both directories are `git subtree --squash` vendors. Never hand-edit them — local
changes live in `overlay/` (adapters) and `overlay/patches/` (unavoidable in-tree
diffs, re-applied on every update).

To update, run `scripts/update-upstream.sh` (see README).
