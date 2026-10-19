#!/usr/bin/env bash
# Resume ONLY a fully built Jiuchen identity V2 release.
# No npm/build, no API restart, no approval/READY write, no change to live API.
set -Eeuo pipefail
trap 'echo "FINALIZE_FAILED: line=$LINENO (active release was not switched)" >&2' ERR
OLD=b9993dfe1e4c1c4be70cf75d8a48873d8bc8166c
NEW=ea8c971008a9efd042ec43fdc62398e136262259
PREPARED=/opt/jiuchen-api/staging/prepared-$NEW
TARGET=/opt/jiuchen-api/releases/$NEW
NODE=/opt/jiuchen-api/runtime/node/bin/node

test "$(id -u)" -eq 0
ACTIVE=$(basename "$(readlink -f /opt/jiuchen-api/current)")
echo "ACTIVE=$ACTIVE"
if [ "$ACTIVE" != "$OLD" ]; then echo "STOP_UNEXPECTED_ACTIVE_RELEASE"; exit 1; fi
if [ -L "$TARGET" ]; then echo "STOP_TARGET_SYMLINK"; exit 1; fi

if [ ! -d "$TARGET" ]; then
  if [ ! -d "$PREPARED" ] || [ -L "$PREPARED" ]; then
    echo "STOP_NO_PREPARED_RELEASE"
    echo "Check build log before rebuilding; nothing was changed."
    exit 1
  fi
  echo "PREPARED_FOUND"
  if command -v namei >/dev/null 2>&1; then
    namei -l "$PREPARED/services/api/dist/server.js"
  fi
  test -f "$PREPARED/services/api/dist/server.js"
  test -f "$PREPARED/services/api/package.json"
  test "$(cat "$PREPARED/COMMIT_SHA")" = "$NEW"
  test "$(stat -c '%U:%G' "$PREPARED")" = "root:root"
  BAD_OWNER=$(find "$PREPARED" -xdev \( ! -user root -o ! -group root \) -print -quit)
  test -z "$BAD_OWNER" || { echo "STOP_BAD_OWNER=$BAD_OWNER"; exit 1; }
  BAD_WRITE=$(find "$PREPARED" -xdev ! -type l \( -perm -0020 -o -perm -0002 \) -print -quit)
  test -z "$BAD_WRITE" || { echo "STOP_BAD_PERMISSIONS=$BAD_WRITE"; exit 1; }
  "$NODE" --check "$PREPARED/services/api/dist/server.js"
  test ! -e "$TARGET" && test ! -L "$TARGET"
  # Move to protected releases before checking service user: staging is restricted.
  mv -T "$PREPARED" "$TARGET"
  echo "CANDIDATE_MOVED_TO_RELEASES"
else
  echo "EXISTING_RELEASE_FOUND; validating without overwriting"
fi

test -f "$TARGET/services/api/dist/server.js"
test -f "$TARGET/services/api/package.json"
test "$(cat "$TARGET/COMMIT_SHA")" = "$NEW"
test "$(stat -c '%U:%G' "$TARGET")" = "root:root"
BAD_OWNER=$(find "$TARGET" -xdev \( ! -user root -o ! -group root \) -print -quit)
test -z "$BAD_OWNER" || { echo "STOP_BAD_OWNER=$BAD_OWNER"; exit 1; }
BAD_WRITE=$(find "$TARGET" -xdev ! -type l \( -perm -0020 -o -perm -0002 \) -print -quit)
test -z "$BAD_WRITE" || { echo "STOP_BAD_PERMISSIONS=$BAD_WRITE"; exit 1; }
runuser -u jiuchen-api -- test -x "$TARGET/services/api/dist"
runuser -u jiuchen-api -- test -r "$TARGET/services/api/dist/server.js"
runuser -u jiuchen-api -- "$NODE" --check "$TARGET/services/api/dist/server.js"
test "$(basename "$(readlink -f /opt/jiuchen-api/current)")" = "$OLD"

echo "IDENTITY_V2_RELEASE_BUILD_PASS"
echo "RELEASE_READY_TO_PROMOTE"
echo "PREPARED_RELEASE=$NEW"
echo "ACTIVE_UNCHANGED=$OLD"
