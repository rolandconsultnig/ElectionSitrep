#!/usr/bin/env bash
# Install Election SitRep nginx site: static SPA + /api proxy to the Node API.
# Serves BOTH HTTP and HTTPS so production works before you have a domain name.
#
# Plain HTTP  → full app + login; live camera is blocked by browsers on http://<ip> (use upload in UI).
# HTTPS       → same app; after trusting the self-signed cert, camera works (secure context).
#
# Run on the production server (from repo or copied script):
#   sudo SITREP_PUBLIC_IP=YOUR_PUBLIC_IP ./scripts/nginx-election-sitrep.sh
#
# First run creates a self-signed cert (needs SITREP_PUBLIC_IP) unless certs already exist.
#
# Environment (optional):
#   SITREP_HTTP_PORT=5535          # HTTP listen port
#   SITREP_HTTPS_PORT=5545         # HTTPS listen port (use 443 after you open firewall / use setcap)
#   SITREP_DEPLOY_ROOT=/path/to/sitrep-app/dist
#   SITREP_API_UPSTREAM=127.0.0.1:5530
#   SITREP_TLS_CERT=...
#   SITREP_TLS_KEY=...
#   SITREP_PUBLIC_IP=...          # required to auto-generate TLS if cert files missing
#   SITREP_SKIP_HTTPS=1           # HTTP only (not recommended for camera on LAN IP)

set -euo pipefail

SITE="election-sitrep"
CONF_PATH="/etc/nginx/sites-available/${SITE}"
ENABLED_PATH="/etc/nginx/sites-enabled/${SITE}"

HTTP_PORT="${SITREP_HTTP_PORT:-5535}"
HTTPS_PORT="${SITREP_HTTPS_PORT:-5545}"
DEPLOY_ROOT="${SITREP_DEPLOY_ROOT:-/election/ElectionSitrep/sitrep-app/dist}"
API_UPSTREAM="${SITREP_API_UPSTREAM:-127.0.0.1:5530}"
TLS_CERT="${SITREP_TLS_CERT:-/etc/nginx/ssl/election-sitrep.crt}"
TLS_KEY="${SITREP_TLS_KEY:-/etc/nginx/ssl/election-sitrep.key}"
SKIP_HTTPS="${SITREP_SKIP_HTTPS:-0}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEN_TLS="${SCRIPT_DIR}/generate-election-sitrep-tls.sh"

if [[ "${SKIP_HTTPS}" != "1" ]]; then
  if [[ ! -f "${TLS_CERT}" || ! -f "${TLS_KEY}" ]]; then
    if [[ -z "${SITREP_PUBLIC_IP:-}" ]]; then
      echo "HTTPS requested but no TLS files found at:" >&2
      echo "  ${TLS_CERT}" >&2
      echo "  ${TLS_KEY}" >&2
      echo "Either place certs there, or set SITREP_PUBLIC_IP and re-run to auto-generate self-signed TLS." >&2
      echo "Example: sudo SITREP_PUBLIC_IP=\$(curl -fsS ifconfig.me) $0" >&2
      exit 1
    fi
    if [[ -f "${GEN_TLS}" ]]; then
      SITREP_TLS_CERT="${TLS_CERT}" SITREP_TLS_KEY="${TLS_KEY}" SITREP_PUBLIC_IP="${SITREP_PUBLIC_IP}" bash "${GEN_TLS}"
    else
      echo "Missing ${GEN_TLS}; copy scripts from the repo or create certs manually." >&2
      exit 1
    fi
  fi
fi

write_http_server() {
  cat <<EOF
server {
    listen ${HTTP_PORT};
    listen [::]:${HTTP_PORT};
    server_name _;

    root ${DEPLOY_ROOT};
    index index.html;

    location /api/ {
        proxy_pass http://${API_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
}

write_https_server() {
  cat <<EOF
server {
    listen ${HTTPS_PORT} ssl http2;
    listen [::]:${HTTPS_PORT} ssl http2;
    server_name _;

    ssl_certificate ${TLS_CERT};
    ssl_certificate_key ${TLS_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;

    root ${DEPLOY_ROOT};
    index index.html;

    location /api/ {
        proxy_pass http://${API_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
}

{
  write_http_server
  if [[ "${SKIP_HTTPS}" != "1" ]]; then
    write_https_server
  fi
} >"${CONF_PATH}"

ln -sf "${CONF_PATH}" "${ENABLED_PATH}"
nginx -t
systemctl reload nginx

echo "Installed ${CONF_PATH} and reloaded nginx."
echo ""
echo "Listening:"
echo "  HTTP  → http://YOUR_SERVER:${HTTP_PORT}/"
echo "  HTTPS → https://YOUR_SERVER:${HTTPS_PORT}/  (accept browser warning for self-signed cert)"
echo "Open firewall ports if needed (example): ufw allow ${HTTP_PORT}/tcp && ufw allow ${HTTPS_PORT}/tcp"
