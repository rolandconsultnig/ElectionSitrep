#!/usr/bin/env bash
# Create a self-signed TLS certificate for Election SitRep (HTTPS by IP until you have a domain).
# Browsers will show a warning — proceed once; after that https://YOUR_IP is a secure context
# (camera / getUserMedia works). Replace with Let's Encrypt after you have a DNS name.
#
# Usage on the server:
#   sudo SITREP_PUBLIC_IP=203.0.113.10 ./scripts/generate-election-sitrep-tls.sh
#
# Optional overrides:
#   SITREP_TLS_CERT=/etc/nginx/ssl/election-sitrep.crt
#   SITREP_TLS_KEY=/etc/nginx/ssl/election-sitrep.key

set -euo pipefail

TLS_CERT="${SITREP_TLS_CERT:-/etc/nginx/ssl/election-sitrep.crt}"
TLS_KEY="${SITREP_TLS_KEY:-/etc/nginx/ssl/election-sitrep.key}"
IP="${SITREP_PUBLIC_IP:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

if [[ -z "${IP}" ]]; then
  echo "Set SITREP_PUBLIC_IP to this server's public IPv4 address, e.g.:" >&2
  echo "  sudo SITREP_PUBLIC_IP=\$(curl -fsS ifconfig.me) $0" >&2
  exit 1
fi

mkdir -p "$(dirname "${TLS_KEY}")"
umask 077

openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout "${TLS_KEY}" \
  -out "${TLS_CERT}" \
  -subj "/CN=${IP}" \
  -addext "subjectAltName=IP:${IP}"

chmod 640 "${TLS_KEY}"
chmod 644 "${TLS_CERT}"

echo "Wrote ${TLS_CERT} and ${TLS_KEY}"
echo "Reload nginx after installing the site: sudo systemctl reload nginx"
