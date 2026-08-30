#!/usr/bin/env bash
# Update the vendored AI-DLC methodology upstream and re-vendor the plugins.
#
#   scripts/update-upstream.sh                  # re-sync the current ref (no-op drill)
#   scripts/update-upstream.sh <ref>            # bump aidlc-workflows (branch/tag)
#
# Steps: git subtree pull → re-vendor plugins (vendor-plugins.mjs) → refresh
# UPSTREAM_VERSIONS.md. Review `git log`/`git diff` afterwards.
#
# The collaboration platform (aws-samples/sample-collaborative-ai-dlc) lives in
# the sibling repo jf-ai-dlc-collaboration — this repo only vendors the AI-DLC
# methodology and packages it as the Claude Code + Codex plugins.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

AIDLC_REPO=https://github.com/awslabs/aidlc-workflows.git

# current ref from UPSTREAM_VERSIONS.md
current_ref() { grep "$1" UPSTREAM_VERSIONS.md | sed -E 's/.*\| `([^`]+)` \(.*/\1/'; }
aidlc_ref="$(current_ref 'upstream/aidlc-workflows')"
[[ $# -gt 0 ]] && aidlc_ref="$1"

[[ -z "$(git status --porcelain)" ]] || { echo "working tree not clean — commit or stash first" >&2; exit 1; }

echo "==> subtree pull aidlc-workflows @ ${aidlc_ref}"
git subtree pull --prefix=upstream/aidlc-workflows "$AIDLC_REPO" "$aidlc_ref" --squash \
  -m "Update upstream/aidlc-workflows to ${aidlc_ref}"

echo "==> re-vendor plugins (dist → plugins, with the OSS transforms)"
node scripts/vendor-plugins.mjs

echo "==> refresh UPSTREAM_VERSIONS.md"
today="$(date +%F)"
aidlc_sha="$(git log --grep="git-subtree-dir: upstream/aidlc-workflows" --format=%b -1 | sed -n 's/.*git-subtree-split: //p' | head -1)"
AIDLC_SHA="$aidlc_sha" TODAY="$today" AIDLC_REF="$aidlc_ref" node -e '
  const fs = require("fs");
  const out = fs.readFileSync("UPSTREAM_VERSIONS.md", "utf8").split("\n").map((line) =>
    line.includes("`upstream/aidlc-workflows`")
      ? line.replace(/\| `[^`]*` \([^)]*\) \| `[0-9a-f]*` \| [0-9-]* \|$/,
          `| \`${process.env.AIDLC_REF}\` (branch) | \`${process.env.AIDLC_SHA}\` | ${process.env.TODAY} |`)
      : line,
  ).join("\n");
  fs.writeFileSync("UPSTREAM_VERSIONS.md", out);
'

git add -A
git status --short | head -20
cat <<EOF

Done. Next steps:
  1. review the changes:            git diff --cached
  2. rebuild the plugins from core: scripts/build-plugin.sh both --check
  3. commit:                        git commit -m "Update upstream/aidlc-workflows to ${aidlc_ref}"
EOF
