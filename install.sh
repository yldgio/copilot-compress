#!/usr/bin/env sh
# copilot-compress installer — Linux/macOS
# Usage: sh install.sh [--project]
set -e

DEST_USER="$HOME/.copilot/extensions/copilot-compress"
DEST_PROJECT=".github/extensions/copilot-compress"

if [ "$1" = "--project" ]; then
  DEST="$DEST_PROJECT"
else
  DEST="$DEST_USER"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$DEST"
echo "Installing copilot-compress to: $DEST"

# Copy only runtime files — no docs, tests, or CI
cp "$SCRIPT_DIR/dist/extension.mjs" "$DEST/"
cp "$SCRIPT_DIR/package.json" "$DEST/"

cd "$DEST"
npm install --omit=dev
echo "Done. Restart Copilot CLI and type /compress status to verify."
