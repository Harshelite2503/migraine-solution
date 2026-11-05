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

# No apt: the distro mirror can be very slow. Fetch Java and Node straight from their publishers.
fetch() { curl -fsSL --retry 5 --retry-delay 5 --connect-timeout 20 --max-time 900 -o "$2" "$1"; }
unzip_to() { python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$2"; }

mkdir -p /opt/jdk
fetch "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse" /tmp/jdk.tar.gz
tar -xzf /tmp/jdk.tar.gz -C /opt/jdk --strip-components=1
export JAVA_HOME=/opt/jdk PATH="/opt/jdk/bin:$PATH"

NODE_VERSION="$(curl -fsSL --retry 5 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o 'node-v22[0-9.]*-linux-x64.tar.xz' | head -n 1)"
fetch "https://nodejs.org/dist/latest-v22.x/$NODE_VERSION" /tmp/node.tar.xz
mkdir -p /opt/node && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1
export PATH="/opt/node/bin:$PATH"
java -version; node --version

export ANDROID_HOME=/opt/android ANDROID_SDK_ROOT=/opt/android
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest" ]; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  fetch https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip /tmp/tools.zip
  unzip_to /tmp/tools.zip "$ANDROID_HOME/cmdline-tools"
  chmod +x "$ANDROID_HOME"/cmdline-tools/cmdline-tools/bin/*
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
yes 2>/dev/null | sdkmanager --licenses > /dev/null || true
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
