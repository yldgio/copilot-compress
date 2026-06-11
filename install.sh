#!/usr/bin/env sh
# copilot-compress installer — Linux/macOS
# Usage:
#   sh install.sh                          # local install (from clone)
#   sh install.sh --project                # project-scoped local install
#   sh install.sh --remote                 # download latest release, user-wide
#   sh install.sh --remote v1.2.0          # download specific release
#   sh install.sh --remote --project       # download latest, project-scoped
set -e

DEST_USER="$HOME/.copilot/extensions/copilot-compress"
DEST_PROJECT=".github/extensions/copilot-compress"
GITHUB_REPO="yldgio/copilot-compress"

REMOTE=false
TAG="latest"
PROJECT=false

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --remote) REMOTE=true; shift ;;
    --project) PROJECT=true; shift ;;
    v*) TAG="$1"; shift ;;   # version tag like v1.2.0
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ "$PROJECT" = "true" ]; then
  DEST="$DEST_PROJECT"
else
  DEST="$DEST_USER"
fi

mkdir -p "$DEST"
echo "Installing copilot-compress to: $DEST"

if [ "$REMOTE" = "true" ]; then
  if [ "$TAG" = "latest" ]; then
    BASE_URL="https://github.com/$GITHUB_REPO/releases/latest/download"
  else
    BASE_URL="https://github.com/$GITHUB_REPO/releases/download/$TAG"
  fi
  echo "Downloading from $BASE_URL ..."
  curl -fsSL "$BASE_URL/extension.mjs" -o "$DEST/extension.mjs"
  curl -fsSL "$BASE_URL/package.json" -o "$DEST/package.json"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  cp "$SCRIPT_DIR/dist/extension.mjs" "$DEST/extension.mjs"
  cp "$SCRIPT_DIR/package.json" "$DEST/package.json"
fi

cd "$DEST"
npm install --omit=dev
echo "Done. Restart Copilot CLI and type /compress status to verify."
