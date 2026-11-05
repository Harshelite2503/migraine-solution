#!/usr/bin/env bash
# Build the Android APK on a temporary Azure VM, then delete the VM.
# Needs: az CLI signed in (az login). The APK stays in a small storage account (pennies a month)
# and you get a download link that works for 7 days. Usage: scripts/azure-android-build.sh [branch]
set -euo pipefail
BRANCH="${1:-main}"
LOCATION="${LOCATION:-eastus}"
# Region:size pairs to try in order; Azure sometimes has no spare capacity for a size in a region.
CANDIDATES="${VM_CANDIDATES:-eastus2:Standard_D8s_v5 westus2:Standard_D8s_v5 eastus2:Standard_D8as_v5 westus2:Standard_D8as_v5 eastus:Standard_D4s_v5 westus3:Standard_D4s_v5}"
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
  i=$((i + 1)); loc="${c%%:*}"; size="${c#*:}"
  echo "Trying $size in $loc…"
  if az vm create -g "$VM_RG" -n "still-build-$i" -l "$loc" --image Canonical:ubuntu-24_04-lts:server:latest --size "$size" \
      --os-disk-size-gb 96 --admin-username still --generate-ssh-keys --nsg-rule NONE --public-ip-sku Standard -o none; then
    VM="still-build-$i"; echo "Created $size in $loc."; break
  fi
  echo "No capacity for $size in $loc; trying the next option."
done
[ -n "$VM" ] || { echo "Azure had no capacity for any VM option. Try again later or set VM_CANDIDATES."; exit 1; }

SCRIPT="$(base64 -w0 < "$HERE/vm-build-android.sh")"
az vm run-command invoke -g "$VM_RG" -n "$VM" --command-id RunShellScript -o none --scripts \
  "echo $SCRIPT | base64 -d > /root/build.sh && chmod +x /root/build.sh && setsid nohup /root/build.sh '$BASE?$W_SAS' https://github.com/shivankur-code/migraine-solution '$BRANCH' > /var/log/still-build.log 2>&1 < /dev/null &"

echo "Building (usually 20–35 minutes)…"
while true; do
  sleep 60
  OUT="$(az vm run-command invoke -g "$VM_RG" -n "$VM" --command-id RunShellScript --scripts 'cat /var/log/still-build.status; tail -n 3 /var/log/still-build.log' --query 'value[0].message' -o tsv)"
  echo "$(date -u +%H:%M) $(printf '%s' "$OUT" | tr '\n' ' ' | cut -c1-200)"
  STATE="$(printf '%s\n' "$OUT" | grep -m1 -xE 'running|done|failed' || true)"
  case "$STATE" in done) break ;; failed) echo "Build failed. Log above."; exit 1 ;; esac
done
echo
echo "APK ready (link valid until $EXP_R):"
echo "$BASE?$R_SAS"
