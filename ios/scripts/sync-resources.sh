#!/bin/sh
# Copy the shared schemes, layouts, dictionaries and font into the iOS targets.
# The JSON under engine/ is the single source of truth; run this after changing it (CI checks it).
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RES="$ROOT/ios/VedicNepaliEngine/Sources/VedicNepaliEngine/Resources"
rm -rf "$RES" && mkdir -p "$RES/schemes" "$RES/layouts" "$RES/dictionaries" "$RES/keyboards"
cp "$ROOT"/engine/transliteration/schemes/*.json "$RES/schemes/"
cp "$ROOT"/engine/transliteration/layouts/*.json "$RES/layouts/"
cp "$ROOT"/engine/suggestions/data/*.json "$RES/dictionaries/"
cp "$ROOT"/engine/keyboards/*.json "$RES/keyboards/"
mkdir -p "$ROOT/ios/Fonts"
cp "$ROOT"/font/builds/static/ttf/VedicNepali-*.ttf "$ROOT/ios/Fonts/"
cp "$ROOT/font/builds/variable/VedicNepali[wght].ttf" "$ROOT/ios/Fonts/VedicNepali-Variable.ttf"
echo "synced resources into ios/"
