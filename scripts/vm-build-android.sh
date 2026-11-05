#!/usr/bin/env bash
# Runs ON the Azure build VM (Ubuntu 24.04). Builds a release APK from the public repo and uploads it
# to the blob URL given as $1 (a write-only SAS URL). Progress: /var/log/still-build.log and .status.
set -euo pipefail
UPLOAD_URL="$1"
REPO="${2:-https://github.com/shivankur-code/migraine-solution}"
BRANCH="${3:-main}"
STATUS=/var/log/still-build.status
echo running > "$STATUS"
trap 'echo failed > "$STATUS"' ERR
export DEBIAN_FRONTEND=noninteractive HOME=/root

apt-get update -q
apt-get install -yq openjdk-17-jdk-headless unzip git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -yq nodejs

export ANDROID_HOME=/opt/android ANDROID_SDK_ROOT=/opt/android
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest" ]; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -fsSLo /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
  unzip -q /tmp/tools.zip -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
yes | sdkmanager --licenses > /dev/null
sdkmanager --install "platform-tools" > /dev/null

rm -rf /build && git clone --depth 1 --branch "$BRANCH" "$REPO" /build
cd /build
npm ci
CI=1 npx expo prebuild --platform android --no-install
cd android
# Phones only (arm64) to keep the build fast; Gradle installs any missing SDK, NDK or CMake itself.
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a

APK=app/build/outputs/apk/release/app-release.apk
ls -la "$APK"
curl -fsS -X PUT -H "x-ms-blob-type: BlockBlob" -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @"$APK" "$UPLOAD_URL"
echo done > "$STATUS"
