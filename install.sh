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

echo "Done. Restart OpenCode if it is already running."
