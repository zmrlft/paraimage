#!/bin/sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <app_path> <output_dmg> [volume_name]" 1>&2
  exit 1
fi

APP_PATH="$1"
OUT_PATH="$2"
VOL_NAME="${3:-ParaImage}"

if [ ! -d "$APP_PATH" ]; then
  echo "App bundle not found: $APP_PATH" 1>&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ditto "$APP_PATH" "$TMP_DIR/$(basename "$APP_PATH")"
hdiutil create -volname "$VOL_NAME" -srcfolder "$TMP_DIR" -ov -format UDZO "$OUT_PATH"
