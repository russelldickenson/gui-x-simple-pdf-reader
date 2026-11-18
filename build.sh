#!/usr/bin/env bash
#
# Builds the release application bundles.
#
#   ./build.sh
#
# Artifacts land in src-tauri/target/release/bundle:
#   macOS    Simple PDF Viewer_*.app and Simple PDF Viewer_*.dmg
#   Windows  Simple PDF Viewer_*.msi and Simple PDF Viewer_*.exe

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npm > /dev/null 2>&1; then
  echo "error: npm is not installed or not on PATH" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "installing dependencies..."
  npm ci
fi

# Creating the .dmg is racy on recent macOS releases: the bundler waits for a
# .DS_Store that sometimes does not show up in time. Retry once, the Rust part
# is cached by then.
if ! npm run tauri build; then
  echo
  echo "build failed, retrying once..."
  npm run tauri build
fi

echo
echo "bundles:"
find src-tauri/target/release/bundle -maxdepth 2 \
  \( -name '*.dmg' -o -name '*.app' -o -name '*.msi' -o -name '*.exe' \) \
  -print 2> /dev/null || true
