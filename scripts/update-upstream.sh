#!/usr/bin/env bash
# Update the vendored upstreams and regenerate everything derived from them.
#
#   scripts/update-upstream.sh                       # re-sync current refs (no-op drill)
#   scripts/update-upstream.sh --aidlc <ref>         # bump aidlc-workflows (branch/tag)
#   scripts/update-upstream.sh --collab <ref>        # bump sample-collaborative-ai-dlc
#
# Steps: git subtree pull → apply overlay/patches/*.patch (fails loudly on
# conflict) → regen routes/tables → re-vendor plugins → run the dynamo-pg
# suite → refresh UPSTREAM_VERSIONS.md. Review `git log`/`git diff` afterwards
# and run the oracle (upstream vitest via overlay/oracle) before merging.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

AIDLC_REPO=https://github.com/awslabs/aidlc-workflows.git
COLLAB_REPO=https://github.com/aws-samples/sample-collaborative-ai-dlc.git

# current refs from UPSTREAM_VERSIONS.md
current_ref() { grep "$1" UPSTREAM_VERSIONS.md | sed -E 's/.*\| `([^`]+)` \(.*/\1/'; }
aidlc_ref="$(current_ref 'upstream/aidlc-workflows')"
collab_ref="$(current_ref 'upstream/collab')"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --aidlc) aidlc_ref="$2"; shift 2 ;;
    --collab) collab_ref="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

[[ -z "$(git status --porcelain)" ]] || { echo "working tree not clean — commit or stash first" >&2; exit 1; }

echo "==> subtree pull aidlc-workflows @ ${aidlc_ref}"
git subtree pull --prefix=upstream/aidlc-workflows "$AIDLC_REPO" "$aidlc_ref" --squash \
  -m "Update upstream/aidlc-workflows to ${aidlc_ref}"

echo "==> subtree pull collab @ ${collab_ref}"
git subtree pull --prefix=upstream/collab "$COLLAB_REPO" "$collab_ref" --squash \
  -m "Update upstream/collab to ${collab_ref}"

echo "==> apply overlay patches"
shopt -s nullglob
for patch in overlay/patches/*.patch; do
  echo "  applying ${patch}"
  if ! git apply --3way "$patch"; then
    echo "PATCH CONFLICT: ${patch} no longer applies — upstream changed the patched code." >&2
    echo "Resolve manually, refresh the patch, and re-run." >&2
    exit 1
  fi
done

echo "==> regenerate derived artifacts"
node scripts/gen-routes.mjs
node scripts/gen-tables.mjs
node scripts/vendor-plugins.mjs

echo "==> dynamo-pg adapter tests"
(cd overlay/dynamo-pg && npm test)

echo "==> refresh UPSTREAM_VERSIONS.md"
today="$(date +%F)"
aidlc_sha="$(git log --grep="git-subtree-dir: upstream/aidlc-workflows" --format=%b -1 | sed -n 's/git-subtree-split: //p')"
collab_sha="$(git log --grep="git-subtree-dir: upstream/collab" --format=%b -1 | sed -n 's/git-subtree-split: //p')"
sed -i \
  -e "s|\(upstream/aidlc-workflows.*\` \)\`[0-9a-f]*\`\( | \).*\( |\)|\1\`${aidlc_sha}\`\2${today}\3|" \
  -e "s|\(upstream/collab.*\` \)\`[0-9a-f]*\`\( | \).*\( |\)|\1\`${collab_sha}\`\2${today}\3|" \
  UPSTREAM_VERSIONS.md

git add -A
git status --short | head -20
cat <<EOF

Done. Next steps:
  1. review the changes:            git diff --cached
  2. run the oracle suite:          cd upstream/collab && npm ci && npx vitest run -c ../../overlay/oracle/vitest.config.js
  3. rebuild + smoke the stack:     cd deploy/compose && docker compose build && docker compose up -d
  4. commit:                        git commit -m "Update upstreams (aidlc: ${aidlc_ref}, collab: ${collab_ref})"
EOF
