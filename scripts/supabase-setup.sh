#!/bin/bash
# Set up Still's Supabase project through the Management API: database tables and security rules
# (supabase/migrations), anonymous sign-in for opt-in sharing, and sign-in emails that carry a
# 6-digit code. Needs a personal access token (Dashboard -> Account -> Access Tokens, starts sbp_)
# in SUPABASE_ACCESS_TOKEN, or a network proxy that adds it.
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-jxalfqqykvrokovndbgh}"
API="https://api.supabase.com/v1/projects/$REF"
AUTH=()
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
cd "$(dirname "$0")/.."

for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$f" |
    curl -fsS "${AUTH[@]}" -H "Content-Type: application/json" -X POST "$API/database/query" --data-binary @- >/dev/null
done

CODE_EMAIL='<h2>Your Still sign-in code</h2><p>Enter this code in Still:</p><p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p><p>It expires in an hour. If you did not ask for it, you can ignore this email.</p>'
python3 - "$CODE_EMAIL" <<'PY' > /tmp/still-auth-config.json
import json, sys
body = sys.argv[1]
print(json.dumps({
  "external_anonymous_users_enabled": True,
  "mailer_otp_length": 6,
  "mailer_subjects_magic_link": "Your Still sign-in code",
  "mailer_templates_magic_link_content": body,
  "mailer_subjects_confirmation": "Your Still sign-in code",
  "mailer_templates_confirmation_content": body,
}))
PY
echo "Updating sign-in settings"
curl -fsS "${AUTH[@]}" -H "Content-Type: application/json" -X PATCH "$API/config/auth" --data-binary @/tmp/still-auth-config.json >/dev/null
echo "Done."
