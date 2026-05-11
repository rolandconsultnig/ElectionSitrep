#!/usr/bin/env bash
# Install Election SitRep nginx site: static SPA + /api proxy to the Node API.
# Serves BOTH HTTP and HTTPS so production works before a domain name.
#
# Plain HTTP  → full app + login; live camera is blocked on http://<ip> unless you use HTTPS or upload.
# HTTPS       → same app; self-signed cert for IP (SAN) — accept browser warning once; camera works.
#
# Do not open https:// on the HTTP-only port (default 5535) — use https:// on an HTTPS listen port (5545 and/or 443).
#
# Install (generates TLS for your public IP if missing):
#   sudo SITREP_PUBLIC_IP=13.53.33.63 ./scripts/nginx-election-sitrep.sh
#
# HTTPS on standard port (bookmark https://YOUR_IP/ with no port):
#   sudo SITREP_PUBLIC_IP=... SITREP_HTTPS_LISTEN="443 5545" ./scripts/nginx-election-sitrep.sh
#
# Optional HTTP → HTTPS redirect (users hitting http:// automatically go to https://):
#   sudo SITREP_PUBLIC_IP=... SITREP_REDIRECT_HTTP_TO_HTTPS=1 ./scripts/nginx-election-sitrep.sh
#
# Environment (optional):
#   SITREP_HTTP_PORT=5535
#   SITREP_HTTPS_PORT=5545              # single HTTPS port (backward compatible)
#   SITREP_HTTPS_LISTEN="443 5545"      # space- or comma-separated; overrides SITREP_HTTPS_PORT if set
#   SITREP_REDIRECT_HTTP_TO_HTTPS=1    # 301 all HTTP traffic to HTTPS (first port in HTTPS list)
#   SITREP_DEPLOY_ROOT=...
#   SITREP_API_UPSTREAM=127.0.0.1:5530
#   SITREP_TLS_CERT=...  SITREP_TLS_KEY=...
#   SITREP_PUBLIC_IP=...               # required to auto-generate TLS if missing
#   SITREP_SKIP_HTTPS=1

set -euo pipefail

SITE="election-sitrep"
CONF_PATH="/etc/nginx/sites-available/${SITE}"
ENABLED_PATH="/etc/nginx/sites-enabled/${SITE}"

HTTP_PORT="${SITREP_HTTP_PORT:-5535}"
DEPLOY_ROOT="${SITREP_DEPLOY_ROOT:-/election/ElectionSitrep/sitrep-app/dist}"
API_UPSTREAM="${SITREP_API_UPSTREAM:-127.0.0.1:5530}"
TLS_CERT="${SITREP_TLS_CERT:-/etc/nginx/ssl/election-sitrep.crt}"
TLS_KEY="${SITREP_TLS_KEY:-/etc/nginx/ssl/election-sitrep.key}"
SKIP_HTTPS="${SITREP_SKIP_HTTPS:-0}"
REDIRECT_HTTP="${SITREP_REDIRECT_HTTP_TO_HTTPS:-0}"

# HTTPS listen ports: prefer SITREP_HTTPS_LISTEN, else SITREP_HTTPS_PORT, else 5545
_raw_listen="${SITREP_HTTPS_LISTEN:-}"
if [[ -z "${_raw_listen}" && -n "${SITREP_HTTPS_PORT:-}" ]]; then
  _raw_listen="${SITREP_HTTPS_PORT}"
fi
if [[ -z "${_raw_listen}" ]]; then
  _raw_listen="5545"
fi
# Normalize commas to spaces, collapse spaces
HTTPS_PORTS_STR="$(echo "${_raw_listen}" | tr ',' ' ' | xargs echo -n)"

HTTPS_PRIMARY="$(echo "${HTTPS_PORTS_STR}" | awk '{print $1}')"

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
      echo "Missing ${GEN_TLS}; copy scripts from the repo or generate certs manually." >&2
      exit 1
    fi
  fi
fi

https_listen_lines() {
  for _p in ${HTTPS_PORTS_STR}; do
    echo "    listen ${_p} ssl http2;"
    echo "    listen [::]:${_p} ssl http2;"
  done
}

write_http_server_redirect_only() {
  local target="$1"
  cat <<EOF
server {
    listen ${HTTP_PORT};
    listen [::]:${HTTP_PORT};
    server_name _;
    return 301 ${target};
}
EOF
}

write_http_server_full() {
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
  {
    echo "server {"
    https_listen_lines
    echo "    server_name _;"
    echo ""
    echo "    ssl_certificate ${TLS_CERT};"
    echo "    ssl_certificate_key ${TLS_KEY};"
    echo "    ssl_protocols TLSv1.2 TLSv1.3;"
    echo ""
    echo "    root ${DEPLOY_ROOT};"
    echo "    index index.html;"
    echo ""
    echo "    location /api/ {"
    echo "        proxy_pass http://${API_UPSTREAM};"
    echo "        proxy_http_version 1.1;"
    echo "        proxy_set_header Host \$host;"
    echo "        proxy_set_header X-Real-IP \$remote_addr;"
    echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
    echo "    }"
    echo ""
    echo "    location / {"
    echo "        try_files \$uri \$uri/ /index.html;"
    echo "    }"
    echo "}"
  }
}

{
  if [[ "${SKIP_HTTPS}" == "1" ]]; then
    write_http_server_full
  elif [[ "${REDIRECT_HTTP}" == "1" ]]; then
    if [[ "${HTTPS_PRIMARY}" == "443" ]]; then
      write_http_server_redirect_only 'https://$host$request_uri'
    else
      write_http_server_redirect_only "https://\$host:${HTTPS_PRIMARY}\$request_uri"
    fi
    write_https_server
  else
    write_http_server_full
    write_https_server
  fi
} >"${CONF_PATH}"

ln -sf "${CONF_PATH}" "${ENABLED_PATH}"
nginx -t
systemctl reload nginx

echo "Installed ${CONF_PATH} and reloaded nginx."
echo ""
echo "HTTPS listen port(s): ${HTTPS_PORTS_STR}"
echo "Primary HTTPS port (for redirects / bookmarks): ${HTTPS_PRIMARY}"
echo ""
if [[ "${SKIP_HTTPS}" == "1" ]]; then
  echo "HTTP only → http://YOUR_SERVER:${HTTP_PORT}/"
elif [[ "${REDIRECT_HTTP}" == "1" ]]; then
  echo "HTTP  → 301 redirect to HTTPS (port ${HTTPS_PRIMARY})"
  for _p in ${HTTPS_PORTS_STR}; do
    if [[ "${_p}" == "443" ]]; then
      echo "HTTPS → https://YOUR_SERVER/   (port 443)"
    else
      echo "HTTPS → https://YOUR_SERVER:${_p}/"
    fi
  done
  echo "Accept the browser warning for the self-signed certificate (valid for IP in SAN)."
else
  echo "HTTP  → http://YOUR_SERVER:${HTTP_PORT}/"
  for _p in ${HTTPS_PORTS_STR}; do
    if [[ "${_p}" == "443" ]]; then
      echo "HTTPS → https://YOUR_SERVER/   (port 443 — open TCP 443 in AWS security group)"
    else
      echo "HTTPS → https://YOUR_SERVER:${_p}/"
    fi
  done
  echo "Accept the browser warning for the self-signed certificate (valid for IP in SAN)."
fi
echo ""
echo "Firewall (example): ufw allow ${HTTP_PORT}/tcp"
if [[ "${SKIP_HTTPS}" != "1" ]]; then
  for _p in ${HTTPS_PORTS_STR}; do
    echo "                     ufw allow ${_p}/tcp"
  done
fi
