#!/usr/bin/env bash
# Build the Android APK on a temporary Azure VM, then delete the VM.
# Needs: az CLI signed in (az login). The APK stays in a small storage account (pennies a month)
# and you get a download link that works for 7 days. Usage: scripts/azure-android-build.sh [branch]
# To enable the AI review in the app, export EXPO_PUBLIC_RECIPE_API_URL and EXPO_PUBLIC_RECIPE_API_KEY first.
set -euo pipefail
BRANCH="${1:-main}"
LOCATION="${LOCATION:-eastus}"
# region:size:priority options, tried in order. Spot VMs use spare capacity at ~80% off
# (Standard_D8s_v5: ~$0.07/h Spot vs ~$0.38/h regular), so a ~12-minute build costs 1–2 cents.
# Regular VMs are the fallback when no Spot capacity is free.
CANDIDATES="${VM_CANDIDATES:-westus2:Standard_D8s_v5:Spot eastus2:Standard_D8s_v5:Spot westus2:Standard_D8as_v5:Spot eastus2:Standard_D8as_v5:Spot westus2:Standard_D8s_v5:Regular eastus:Standard_D4s_v5:Regular westus3:Standard_D4s_v5:Regular}"
ART_RG="still-artifacts-rg"
VM_RG="still-build-vm-rg"
HERE="$(cd "$(dirname "$0")" && pwd)"

az group create -n "$ART_RG" -l "$LOCATION" -o none
SA="$(az storage account list -g "$ART_RG" --query '[0].name' -o tsv)"
if [ -z "$SA" ]; then
  SA="stillbuild$(openssl rand -hex 4)"
  az storage account create -n "$SA" -g "$ART_RG" -l "$LOCATION" --sku Standard_LRS --kind StorageV2 \
    --min-tls-version TLS1_2 --allow-blob-public-access false -o none
fi
az storage container-rm create --storage-account "$SA" -g "$ART_RG" -n builds -o none 2>/dev/null || true
KEY="$(az storage account keys list -n "$SA" -g "$ART_RG" --query '[0].value' -o tsv)"
BLOB="still-$(date -u +%Y%m%d-%H%M).apk"
EXP_W="$(date -u -d '+3 hours' +%Y-%m-%dT%H:%MZ)"
EXP_R="$(date -u -d '+7 days' +%Y-%m-%dT%H:%MZ)"
W_SAS="$(az storage blob generate-sas --account-name "$SA" --account-key "$KEY" -c builds -n "$BLOB" --permissions cw --expiry "$EXP_W" --https-only -o tsv)"
R_SAS="$(az storage blob generate-sas --account-name "$SA" --account-key "$KEY" -c builds -n "$BLOB" --permissions r --expiry "$EXP_R" --https-only -o tsv)"
BASE="https://$SA.blob.core.windows.net/builds/$BLOB"

az group create -n "$VM_RG" -l "$LOCATION" -o none
cleanup() { echo "Deleting the build VM…"; az group delete -n "$VM_RG" --yes --no-wait; }
trap cleanup EXIT
# No inbound ports: the VM is controlled only through Azure's run-command API.
VM=""
i=0
for c in $CANDIDATES; do
  i=$((i + 1)); IFS=: read -r loc size priority <<< "$c"; priority="${priority:-Regular}"
  echo "Trying $priority $size in $loc…"
  SPOT_ARGS=()
  [ "$priority" = "Spot" ] && SPOT_ARGS=(--priority Spot --eviction-policy Delete --max-price -1)
  if az vm create -g "$VM_RG" -n "still-build-$i" -l "$loc" --image Canonical:ubuntu-24_04-lts:server:latest --size "$size" \
      --os-disk-size-gb 64 --storage-sku StandardSSD_LRS --admin-username still --generate-ssh-keys --nsg-rule NONE \
      --public-ip-sku Standard "${SPOT_ARGS[@]}" -o none; then
    VM="still-build-$i"; echo "Created $priority $size in $loc."; break
  fi
  echo "No capacity for $priority $size in $loc; trying the next option."
done
[ -n "$VM" ] || { echo "Azure had no capacity for any VM option. Try again later or set VM_CANDIDATES."; exit 1; }

SCRIPT="$(base64 -w0 < "$HERE/vm-build-android.sh")"
az vm run-command invoke -g "$VM_RG" -n "$VM" --command-id RunShellScript -o none --scripts \
  "echo $SCRIPT | base64 -d > /root/build.sh && chmod +x /root/build.sh && setsid nohup /root/build.sh '$BASE?$W_SAS' https://github.com/shivankur-code/migraine-solution '$BRANCH' '${EXPO_PUBLIC_RECIPE_API_URL:-}' '${EXPO_PUBLIC_RECIPE_API_KEY:-}' > /var/log/still-build.log 2>&1 < /dev/null &"

echo "Building (usually 10–15 minutes)…"
misses=0
while true; do
  sleep 60
  OUT="$(az vm run-command invoke -g "$VM_RG" -n "$VM" --command-id RunShellScript --scripts 'cat /var/log/still-build.status; tail -n 3 /var/log/still-build.log' --query 'value[0].message' -o tsv 2>/dev/null || true)"
  echo "$(date -u +%H:%M) $(printf '%s' "$OUT" | tr '\n' ' ' | cut -c1-200)"
  STATE="$(printf '%s\n' "$OUT" | grep -m1 -xE 'running|done|failed' || true)"
  if [ -z "$STATE" ]; then
    misses=$((misses + 1))
    # A Spot VM can be reclaimed by Azure mid-build; it is then deleted. Stop and say so.
    if [ "$misses" -ge 5 ] && ! az vm show -g "$VM_RG" -n "$VM" -o none 2>/dev/null; then
      echo "The Spot VM was reclaimed by Azure. Run the script again, or set VM_CANDIDATES to a Regular option."; exit 1
    fi
  else misses=0; fi
  case "$STATE" in done) break ;; failed) echo "Build failed. Log above."; exit 1 ;; esac
done
echo
echo "APK ready (link valid until $EXP_R):"
echo "$BASE?$R_SAS"
