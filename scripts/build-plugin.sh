#!/usr/bin/env bash
# Fully automatic transition: core AI-DLC → Claude Code / Codex plugin.
#
#   scripts/build-plugin.sh                 # both harnesses
#   scripts/build-plugin.sh claude          # just the Claude Code plugin
#   scripts/build-plugin.sh codex           # just the Codex plugin
#   scripts/build-plugin.sh both --check    # verify dist matches core, then transform
#   scripts/build-plugin.sh --from-dist     # skip the core rebuild, transform committed dist only
#
# Pipeline per harness:
#   1. core→dist : upstream's own packager (`bun scripts/package.ts <harness>`)
#                  regenerates upstream/aidlc-workflows/dist/<harness> from the
#                  hand-authored core/ + harness/ sources. Byte-identical to the
#                  committed dist when core is unchanged (drift-guarded upstream).
#   2. dist→plugin: scripts/vendor-plugins.mjs applies the OSS transforms
#                  (strip AWS MCP servers; Codex → native OpenAI auth; collab
#                  toggle templates) into plugins/<harness>.
#
# Requires `bun` for step 1 (install: curl -fsSL https://bun.sh/install | bash).
# Use --from-dist to run only step 2 when bun is unavailable or you only want
# to re-apply the transforms to the already-vendored upstream dist.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
upstream="$root/upstream/aidlc-workflows"

harnesses=()
check=0
from_dist=0
for arg in "$@"; do
  case "$arg" in
    claude|codex) harnesses+=("$arg") ;;
    both) harnesses+=(claude codex) ;;
    --check) check=1 ;;
    --from-dist) from_dist=1 ;;
    *) echo "unknown arg: $arg (want claude|codex|both, --check, --from-dist)" >&2; exit 1 ;;
  esac
done
[[ ${#harnesses[@]} -eq 0 ]] && harnesses=(claude codex)

if [[ $from_dist -eq 0 ]]; then
  if ! command -v bun >/dev/null 2>&1; then
    echo "error: bun is required for the core→dist rebuild." >&2
    echo "  install:  curl -fsSL https://bun.sh/install | bash" >&2
    echo "  or skip the rebuild and transform the committed dist:  $0 ${harnesses[*]} --from-dist" >&2
    exit 1
  fi

  # step 0: install the packager's toolchain once
  if [[ ! -d "$upstream/node_modules" ]]; then
    echo "==> installing packager dependencies (bun install)"
    (cd "$upstream" && bun install)
  fi

  # step 1: core → dist, per harness
  for harness in "${harnesses[@]}"; do
    echo "==> core→dist: bun scripts/package.ts $harness"
    (cd "$upstream" && bun scripts/package.ts "$harness")
    if [[ $check -eq 1 ]]; then
      echo "==> drift check: $harness"
      (cd "$upstream" && bun scripts/package.ts "$harness" --check)
    fi
  done
else
  echo "==> --from-dist: skipping core rebuild, transforming committed dist"
fi

# step 2: dist → plugin, per harness
echo "==> dist→plugin: transforms"
node "$root/scripts/vendor-plugins.mjs" "${harnesses[@]}"

echo
echo "done — built plugin(s): ${harnesses[*]}"
echo "install into a project:  scripts/install-plugin.sh <target-dir> ${harnesses[*]} [--with-collab|--no-collab]"
