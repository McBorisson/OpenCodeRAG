#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
PLUGIN_NAME="opencode-rag"

command -v npm >/dev/null 2>&1 || {
  echo "npm is required but was not found in PATH" >&2
  exit 1
}

command -v opencode >/dev/null 2>&1 || {
  echo "opencode is required but was not found in PATH" >&2
  exit 1
}

cd "$REPO_ROOT"

echo "Building $PLUGIN_NAME..."
npm run build

echo "Writing OpenCode local plugin wrapper..."
mkdir -p "$REPO_ROOT/.opencode/plugins"
cat > "$REPO_ROOT/.opencode/plugins/package.json" <<'EOF'
{
  "type": "module"
}
EOF

cat > "$REPO_ROOT/.opencode/plugins/rag-plugin.js" <<'EOF'
import { ragPlugin } from "../../dist/plugin.js";

export default ragPlugin;
export const server = ragPlugin;
EOF

echo "Installing globally in OpenCode (~/.config/opencode)..."
GLOBAL_OPENCODE="$HOME/.config/opencode"
mkdir -p "$GLOBAL_OPENCODE"

PACKED=$(npm pack --pack-destination "$GLOBAL_OPENCODE" 2>&1 | tail -1)

npm install --prefix "$GLOBAL_OPENCODE" --silent "$GLOBAL_OPENCODE/$PACKED"

if [ -f "$GLOBAL_OPENCODE/opencode.jsonc" ]; then
  if ! grep -q "\"opencode-rag\"" "$GLOBAL_OPENCODE/opencode.jsonc"; then
    echo "Adding opencode-rag to global plugin list in opencode.jsonc..."
    TEMP=$(mktemp)
    node -e "
      const fs = require('fs');
      const c = JSON.parse(fs.readFileSync('$GLOBAL_OPENCODE/opencode.jsonc','utf8'));
      c.plugin = c.plugin || [];
      c.plugin.push('opencode-rag');
      fs.writeFileSync(process.argv[1], JSON.stringify(c, null, 2) + '\n');
    " "$TEMP"
    mv "$TEMP" "$GLOBAL_OPENCODE/opencode.jsonc"
  else
    echo "opencode-rag already in global plugin list."
  fi
elif [ -f "$GLOBAL_OPENCODE/opencode.json" ]; then
  if ! grep -q "\"opencode-rag\"" "$GLOBAL_OPENCODE/opencode.json"; then
    node -e "
      const fs = require('fs');
      const c = JSON.parse(fs.readFileSync('$GLOBAL_OPENCODE/opencode.json','utf8'));
      c.plugin = c.plugin || [];
      c.plugin.push('opencode-rag');
      fs.writeFileSync('$GLOBAL_OPENCODE/opencode.json', JSON.stringify(c, null, 2) + '\n');
    "
  fi
else
  echo "Creating global opencode.jsonc with opencode-rag plugin..."
  cat > "$GLOBAL_OPENCODE/opencode.jsonc" << JSONEOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-rag"]
}
JSONEOF
fi

echo "Done. Restart OpenCode if it is already running."
