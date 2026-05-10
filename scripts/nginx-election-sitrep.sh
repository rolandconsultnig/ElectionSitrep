#!/usr/bin/env bash
# Install Election SitRep nginx site (static SPA on 5535, API proxy to 5530).
# Run on the production server: sudo ./scripts/nginx-election-sitrep.sh

set -euo pipefail

SITE="election-sitrep"
CONF_PATH="/etc/nginx/sites-available/${SITE}"
ENABLED_PATH="/etc/nginx/sites-enabled/${SITE}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

cat >"${CONF_PATH}" <<'NGINX'
server {
    listen 5535;
    listen [::]:5535;
    server_name 13.53.33.63;

    root /election/ElectionSitrep/sitrep-app/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5530;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

ln -sf "${CONF_PATH}" "${ENABLED_PATH}"
nginx -t
systemctl reload nginx

echo "Installed ${CONF_PATH} and reloaded nginx."
