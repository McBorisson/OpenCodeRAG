#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
OPENCODE_HOME="${OPENCODE_HOME:-$HOME/.opencode}"
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

echo "Installing $PLUGIN_NAME into $OPENCODE_HOME..."
rm -rf "$OPENCODE_HOME/node_modules/$PLUGIN_NAME"
npm install --prefix "$OPENCODE_HOME" --legacy-peer-deps "$REPO_ROOT"

echo "Refreshing OpenCode plugin registration..."
opencode plugin "$PLUGIN_NAME" --force --log-level INFO

echo "Done. Restart OpenCode if it is already running."
