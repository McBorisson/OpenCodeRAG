#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
PLUGIN_NAME="opencode-rag-plugin"
CLI_BIN_DIR="$HOME/.local/bin"
GLOBAL_OPENCODE="$HOME/.config/opencode"

command -v npm >/dev/null 2>&1 || {
  echo "npm is required but was not found in PATH" >&2
  exit 1
}

command -v opencode >/dev/null 2>&1 || {
  echo "opencode is required but was not found in PATH" >&2
  exit 1
}

# --- uninstall ---------------------------------------------------------------
if [ "${1:-}" = "uninstall" ]; then
  echo "Uninstalling $PLUGIN_NAME..."

  rm -f "$CLI_BIN_DIR/opencode-rag"
  rm -f "$GLOBAL_OPENCODE/opencode-rag-"*.tgz

  if [ -f "$GLOBAL_OPENCODE/package.json" ]; then
    node -e "
      const fs = require('fs');
      const p = '$GLOBAL_OPENCODE/package.json';
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (pkg.dependencies && pkg.dependencies['$PLUGIN_NAME']) {
        delete pkg.dependencies['$PLUGIN_NAME'];
      }
      fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
    "
    cd "$GLOBAL_OPENCODE" && npm prune --silent 2>/dev/null || true
  fi

  for cfg in opencode.jsonc opencode.json; do
    cfgpath="$GLOBAL_OPENCODE/$cfg"
    if [ -f "$cfgpath" ]; then
      node -e "
        const fs = require('fs');
        const c = JSON.parse(fs.readFileSync('$cfgpath', 'utf8'));
        if (c.plugin) {
          c.plugin = c.plugin.filter(p => p !== '$PLUGIN_NAME');
          if (c.plugin.length === 0) delete c.plugin;
        }
        fs.writeFileSync('$cfgpath', JSON.stringify(c, null, 2) + '\n');
      "
    fi
  done

  echo "Removing old workspace-local wrapper..."
  rm -f "$REPO_ROOT/.opencode/plugins/rag-plugin.js" \
        "$REPO_ROOT/.opencode/plugins/package.json"
  rmdir "$REPO_ROOT/.opencode/plugins" 2>/dev/null || true

  echo "Uninstalled. Restart OpenCode if it is running."
  exit 0
fi

# --- install -----------------------------------------------------------------
cd "$REPO_ROOT"

echo "Building $PLUGIN_NAME..."
npm run build

echo "Installing globally in OpenCode (~/.config/opencode)..."
mkdir -p "$GLOBAL_OPENCODE"

rm -rf "$GLOBAL_OPENCODE/node_modules/$PLUGIN_NAME"
PACKED=$(npm pack --pack-destination "$GLOBAL_OPENCODE" 2>&1 | tail -1)
npm install --prefix "$GLOBAL_OPENCODE" --silent "$GLOBAL_OPENCODE/$PACKED"

echo "Making CLI available on PATH..."
mkdir -p "$CLI_BIN_DIR"
rm -f "$CLI_BIN_DIR/opencode-rag"
cat > "$CLI_BIN_DIR/opencode-rag" << WRAPPER
#!/usr/bin/env bash
exec node "$HOME/.config/opencode/node_modules/$PLUGIN_NAME/dist/cli.js" "\$@"
WRAPPER
chmod +x "$CLI_BIN_DIR/opencode-rag"

echo "Registering plugin with OpenCode..."
if [ -f "$GLOBAL_OPENCODE/opencode.jsonc" ]; then
  if ! grep -q "\"$PLUGIN_NAME\"" "$GLOBAL_OPENCODE/opencode.jsonc"; then
    TEMP=$(mktemp)
    node -e "
      const fs = require('fs');
      const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      c.plugin = c.plugin || [];
      c.plugin.push('$PLUGIN_NAME');
      fs.writeFileSync(process.argv[2], JSON.stringify(c, null, 2) + '\n');
    " "$GLOBAL_OPENCODE/opencode.jsonc" "$TEMP"
    mv "$TEMP" "$GLOBAL_OPENCODE/opencode.jsonc"
  fi
elif [ -f "$GLOBAL_OPENCODE/opencode.json" ]; then
  if ! grep -q "\"$PLUGIN_NAME\"" "$GLOBAL_OPENCODE/opencode.json"; then
    node -e "
      const fs = require('fs');
      const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      c.plugin = c.plugin || [];
      c.plugin.push('$PLUGIN_NAME');
      fs.writeFileSync(process.argv[1], JSON.stringify(c, null, 2) + '\n');
    " "$GLOBAL_OPENCODE/opencode.json"
  fi
else
  cat > "$GLOBAL_OPENCODE/opencode.jsonc" << JSONEOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["$PLUGIN_NAME"]
}
JSONEOF
fi

echo "Cleaning up old workspace-local wrapper (no longer needed)..."
rm -f "$REPO_ROOT/.opencode/plugins/rag-plugin.js" \
      "$REPO_ROOT/.opencode/plugins/package.json"
rmdir "$REPO_ROOT/.opencode/plugins" 2>/dev/null || true

echo ""
echo "Done. You can now run 'opencode-rag --help' from anywhere."
echo "Run '$0 uninstall' to remove."
echo "Restart OpenCode if it is already running."
