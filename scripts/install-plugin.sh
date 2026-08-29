#!/usr/bin/env bash
# Install the vendored AI-DLC plugin(s) into a consuming project.
#
#   scripts/install-plugin.sh <target-dir> <claude|codex|both> [--with-collab|--no-collab]
#
# Collaboration toggle (default: --no-collab):
#   --with-collab  merges the collab platform MCP entry into the project
#                  (claude: .mcp.json / codex: .codex/config.toml marker block)
#   --no-collab    removes that entry if present — the supported way to keep
#                  smaller projects free of the collab dependency
#
# Existing files in the target are never overwritten: .mcp.json is key-merged
# (existing user entries win), .gitignore is appended line-wise, and an existing
# .codex/config.toml is left alone (a .aidlc-new copy is written for manual merge).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:?usage: install-plugin.sh <target-dir> <claude|codex|both> [--with-collab|--no-collab]}"
harness="${2:?harness required: claude|codex|both}"
collab="${3:---no-collab}"

[[ -d "$target" ]] || { echo "target dir not found: $target" >&2; exit 1; }
target="$(cd "$target" && pwd)"

case "$harness" in
  claude|codex|both) ;;
  *) echo "unknown harness: $harness (want claude|codex|both)" >&2; exit 1 ;;
esac
case "$collab" in
  --with-collab|--no-collab) ;;
  *) echo "unknown flag: $collab (want --with-collab|--no-collab)" >&2; exit 1 ;;
esac

append_gitignore() { # $1 = plugin gitignore, $2 = target gitignore
  if [[ ! -f "$2" ]]; then cp "$1" "$2"; return; fi
  while IFS= read -r line; do
    grep -qxF "$line" "$2" || printf '%s\n' "$line" >>"$2"
  done <"$1"
}

merge_mcp_json() { # $1 = source json, $2 = target json (existing target keys win)
  node -e '
    const fs = require("fs");
    const [src, dst] = process.argv.slice(1);
    const a = JSON.parse(fs.readFileSync(src, "utf8"));
    const b = fs.existsSync(dst) ? JSON.parse(fs.readFileSync(dst, "utf8")) : {};
    b.mcpServers = { ...a.mcpServers, ...(b.mcpServers ?? {}) };
    fs.writeFileSync(dst, JSON.stringify(b, null, 2) + "\n");
  ' "$1" "$2"
}

remove_mcp_entry() { # $1 = target json, $2 = server name
  [[ -f "$1" ]] || return 0
  node -e '
    const fs = require("fs");
    const [dst, name] = process.argv.slice(1);
    const b = JSON.parse(fs.readFileSync(dst, "utf8"));
    if (b.mcpServers && name in b.mcpServers) {
      delete b.mcpServers[name];
      fs.writeFileSync(dst, JSON.stringify(b, null, 2) + "\n");
    }
  ' "$1" "$2"
}

strip_collab_toml() { # $1 = target config.toml
  [[ -f "$1" ]] || return 0
  sed -i '/^# >>> jf-ai-dlc collab >>>$/,/^# <<< jf-ai-dlc collab <<<$/d' "$1"
}

install_claude() {
  local src="$here/plugins/claude"
  # copy everything except the files needing merge logic and the collab template
  (cd "$src" && find . -mindepth 1 \
      ! -path './.mcp.json' ! -path './.gitignore' ! -path './collab.mcp.json' \
      -type d -exec mkdir -p "$target/{}" \; )
  (cd "$src" && find . \
      ! -path './.mcp.json' ! -path './.gitignore' ! -path './collab.mcp.json' \
      -type f -exec cp -n "{}" "$target/{}" \; )
  merge_mcp_json "$src/.mcp.json" "$target/.mcp.json"
  append_gitignore "$src/.gitignore" "$target/.gitignore"
  if [[ "$collab" == "--with-collab" ]]; then
    merge_mcp_json "$src/collab.mcp.json" "$target/.mcp.json"
  else
    remove_mcp_entry "$target/.mcp.json" "collaborative-aidlc"
  fi
  echo "installed claude plugin into $target (collab: ${collab#--})"
}

install_codex() {
  local src="$here/plugins/codex"
  (cd "$src" && find . -mindepth 1 \
      ! -path './.codex/config.toml' ! -path './.gitignore' ! -path './collab-mcp.toml' \
      -type d -exec mkdir -p "$target/{}" \; )
  (cd "$src" && find . \
      ! -path './.codex/config.toml' ! -path './.gitignore' ! -path './collab-mcp.toml' \
      -type f -exec cp -n "{}" "$target/{}" \; )
  mkdir -p "$target/.codex"
  if [[ -f "$target/.codex/config.toml" ]]; then
    # compare against the target with the collab marker block stripped, so a
    # previous --with-collab install doesn't read as a user-modified config
    local stripped
    stripped="$(mktemp)"
    sed '/^# >>> jf-ai-dlc collab >>>$/,/^# <<< jf-ai-dlc collab <<<$/d' \
      "$target/.codex/config.toml" >"$stripped"
    if ! cmp -s "$src/.codex/config.toml" "$stripped"; then
      cp "$src/.codex/config.toml" "$target/.codex/config.toml.aidlc-new"
      echo "  note: existing .codex/config.toml kept; new version at .codex/config.toml.aidlc-new" >&2
    fi
    rm -f "$stripped"
  else
    cp "$src/.codex/config.toml" "$target/.codex/config.toml"
  fi
  append_gitignore "$src/.gitignore" "$target/.gitignore"
  strip_collab_toml "$target/.codex/config.toml"
  if [[ "$collab" == "--with-collab" ]]; then
    cat "$src/collab-mcp.toml" >>"$target/.codex/config.toml"
  fi
  echo "installed codex plugin into $target (collab: ${collab#--})"
}

case "$harness" in
  claude) install_claude ;;
  codex) install_codex ;;
  both) install_claude; install_codex ;;
esac
