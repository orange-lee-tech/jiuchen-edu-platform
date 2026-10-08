#!/usr/bin/env bash
# Prepare a frozen, validated identity-only Jiuchen API release.
# DO NOT switch current, write approved-release / READY, or restart services.
set -Eeuo pipefail

EXPECTED_OLD=b9993dfe1e4c1c4be70cf75d8a48873d8bc8166c
NEW=ea8c971008a9efd042ec43fdc62398e136262259
PKG=/opt/jiuchen-api/staging/jiuchen-api-ea8c9710-release.tar.gz
WORK=/opt/jiuchen-api/staging/build-$NEW
PREPARED=/opt/jiuchen-api/staging/prepared-$NEW
TARGET=/opt/jiuchen-api/releases/$NEW
NODE=/opt/jiuchen-api/runtime/node/bin/node

if [ "$(id -u)" -ne 0 ]; then echo ROOT_REQUIRED; exit 1; fi
ACTIVE=$(basename "$(readlink -f /opt/jiuchen-api/current)")
echo "CURRENT=$ACTIVE"
if [ "$ACTIVE" != "$EXPECTED_OLD" ]; then
  echo "STOP_UNEXPECTED_ACTIVE_RELEASE"; exit 1
fi

test -f "$PKG" || { echo MISSING_PACKAGE; exit 1; }
for dir in "$WORK" "$PREPARED" "$TARGET"; do
  if [ -e "$dir" ]; then echo "STOP_EXISTING_DIRECTORY=$dir"; exit 1; fi
done

"$NODE" -v
sha256sum "$PKG"
tar -tzf "$PKG" | grep -x 'services/api/package.json' >/dev/null
tar -tzf "$PKG" | grep -x 'services/api/package-lock.json' >/dev/null

mkdir -p "$WORK"
tar -xzf "$PKG" -C "$WORK"
cd "$WORK/services/api"
export PATH=/opt/jiuchen-api/runtime/node/bin:$PATH
node -v
npm -v
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build

npm prune --omit=dev --no-audit --no-fund

mkdir -p "$PREPARED"
cp -a "$WORK/services" "$PREPARED/"
printf '%s\n' "$NEW" > "$PREPARED/COMMIT_SHA"
chown -R root:root "$PREPARED"
chmod -R a+rX "$PREPARED"
chmod -R go-w "$PREPARED"

test -f "$PREPARED/services/api/dist/server.js"
test "$(cat "$PREPARED/COMMIT_SHA")" = "$NEW"
BAD=$(find "$PREPARED" -xdev ! -type l \( -perm -0020 -o -perm -0002 \) -print -quit)
test -z "$BAD"

runuser -u jiuchen-api -- test -r "$PREPARED/services/api/dist/server.js"
runuser -u jiuchen-api -- "$NODE" --check "$PREPARED/services/api/dist/server.js"

mv "$PREPARED" "$TARGET"
test "$(cat "$TARGET/COMMIT_SHA")" = "$NEW"

echo "IDENTITY_V2_RELEASE_BUILD_PASS"
echo "PREPARED_RELEASE=$NEW"
echo "ACTIVE_UNCHANGED=$(basename "$(readlink -f /opt/jiuchen-api/current)")"
