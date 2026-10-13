#!/bin/zsh
# Build, sign, notarize, and staple a Foolscap DMG.
#   scripts/release.sh            → build/Foolscap-<version>.dmg
# Needs: the Developer ID Application certificate in the login keychain
# and a notarytool keychain profile named foolscap-notary.
set -euo pipefail
cd "$(dirname "$0")/.."
PROFILE="${NOTARY_PROFILE:-foolscap-notary}"
VERSION=$(grep -E '^\s*MARKETING_VERSION:' project.yml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
rm -rf build/release && mkdir -p build/release
xcodegen generate --quiet
echo "release: building ${VERSION}"
xcodebuild -project Foolscap.xcodeproj -scheme Foolscap -configuration Release -derivedDataPath build/release/DerivedData build 2>&1 | grep -E "error:|BUILD" || true
APP=build/release/DerivedData/Build/Products/Release/Foolscap.app
[ -d "$APP" ] || { echo "release: no app built"; exit 1; }
codesign --verify --deep --strict "$APP" && echo "release: signature valid ($(codesign -dv "$APP" 2>&1 | grep -o 'Authority=Developer ID Application[^,]*' | head -1))"
DMG="build/Foolscap-${VERSION}.dmg"
rm -f "$DMG"
STAGE=build/release/dmg && rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/" && ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "Foolscap ${VERSION}" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
codesign --sign "Developer ID Application: SEANAN MC CULLOUGH (4J2T5H73JM)" --timestamp "$DMG"
echo "release: notarizing"
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait 2>&1 | grep -E "status:|id:" | head -3
xcrun stapler staple "$DMG" >/dev/null && echo "release: stapled"
spctl -a -t open --context context:primary-signature -v "$DMG" 2>&1 | tail -1
du -h "$DMG" | cut -f1 | sed 's/^/release: /'
