#!/usr/bin/env sh
# copilot-compress installer — Linux/macOS
# Usage: sh install.sh [--project]
set -e

DEST_USER="$HOME/.copilot/extensions/copilot-compress"
DEST_PROJECT=".github/extensions/copilot-compress"

if [ "$1" = "--project" ]; then
  DEST="$DEST_PROJECT"
  mkdir -p "$DEST"
else
  DEST="$DEST_USER"
  mkdir -p "$DEST"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing copilot-compress to: $DEST"
cp -r "$SCRIPT_DIR/." "$DEST/"
cd "$DEST"
npm install --omit=dev
echo "Done. Restart Copilot CLI and type /compress status to verify."
