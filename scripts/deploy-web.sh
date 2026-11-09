#!/bin/bash
# Build the web version of Still and publish it to its Azure Storage static website.
# Needs: az login (the Azure account that owns still-review-rg). The site has no AI review
# (no server key is built in), so nothing secret is published.
set -euo pipefail
ACCOUNT="${WEB_STORAGE_ACCOUNT:-stillweb6afac7}"
cd "$(dirname "$0")/.."
rm -rf dist-web
npx expo export --platform web --output-dir dist-web
node scripts/privacy-html.mjs dist-web/privacy.html
az storage blob service-properties update --account-name "$ACCOUNT" --static-website --index-document index.html --404-document index.html -o none
az storage blob upload-batch --account-name "$ACCOUNT" -d '$web' -s dist-web --overwrite --only-show-errors -o none
# Routes as files too, so links like /tune load with a normal 200 status.
for route in tune journal; do
  az storage blob upload --account-name "$ACCOUNT" -c '$web' -n "$route" -f dist-web/index.html --content-type text/html --overwrite --only-show-errors -o none
done
echo "Published: $(az storage account show -n "$ACCOUNT" --query primaryEndpoints.web -o tsv)"
