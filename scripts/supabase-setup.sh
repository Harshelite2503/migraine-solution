#!/bin/bash
# Set up Still's Supabase project through the Management API: database tables and security rules
# (supabase/migrations), anonymous sign-in for opt-in sharing, and email-link sign-in that
# returns to the website or the app. Needs a personal access token (Dashboard -> Account -> Access Tokens, starts sbp_)
# in SUPABASE_ACCESS_TOKEN, or a network proxy that adds it. Run with SUPABASE_PROJECT_REF set.
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF to the Still Supabase project ref}"
API="https://api.supabase.com/v1/projects/$REF"
AUTH=()
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
cd "$(dirname "$0")/.."

for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$f" |
    curl -fsS "${AUTH[@]}" -H "Content-Type: application/json" -X POST "$API/database/query" --data-binary @- >/dev/null
done

# Sign-in: an email link that returns to the website or opens the app (still://), and anonymous
# sessions for opt-in sharing. (Custom email templates need your own email sender on the free plan.)
SITE="${STILL_WEB_URL:-https://stillweb6afac7.z20.web.core.windows.net}"
python3 - "$SITE" <<'PY2' > /tmp/still-auth-config.json
import json, sys
site = sys.argv[1]
print(json.dumps({"external_anonymous_users_enabled": True, "site_url": site, "uri_allow_list": f"still://**,{site}/**"}))
PY2
echo "Updating sign-in settings"
curl -fsS "${AUTH[@]}" -H "Content-Type: application/json" -X PATCH "$API/config/auth" --data-binary @/tmp/still-auth-config.json >/dev/null
echo "Done."
