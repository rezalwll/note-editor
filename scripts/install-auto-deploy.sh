#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR=${INSTALL_DIR:-/usr/local/bin}
SERVICE_NAME=${SERVICE_NAME:-notebook-auto-deploy}
ENV_FILE=${ENV_FILE:-/etc/notebook-auto-deploy.env}
SYSTEMD_DIR=${SYSTEMD_DIR:-/etc/systemd/system}
REPO_URL=${REPO_URL:-git@github.com:rezalwll/note-editor.git}
BRANCH=${BRANCH:-master}
APP_DIR=${APP_DIR:-/var/www/notebook}
PORT=${PORT:-3000}
DOMAIN=${DOMAIN:-}
DOMAIN_ALIASES=${DOMAIN_ALIASES:-}
SSL_EMAIL=${SSL_EMAIL:-}

require_root() {
  if [[ ${EUID} -ne 0 ]]; then
    echo "Run this script as root." >&2
    exit 1
  fi
}

write_env_key() {
  local key=$1
  local value=$2

  if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    sed -i "s#^${key}=.*#${key}=\"${value}\"#" "${ENV_FILE}"
  else
    printf '%s="%s"\n' "${key}" "${value}" >>"${ENV_FILE}"
  fi
}

require_root

apt-get update
apt-get install -y git

install -d "${INSTALL_DIR}"
install -m 755 "$(dirname "$0")/auto-deploy-server.sh" "${INSTALL_DIR}/${SERVICE_NAME}"

touch "${ENV_FILE}"
write_env_key REPO_URL "${REPO_URL}"
write_env_key BRANCH "${BRANCH}"
write_env_key APP_DIR "${APP_DIR}"
write_env_key PORT "${PORT}"
write_env_key DOMAIN "${DOMAIN}"
write_env_key DOMAIN_ALIASES "${DOMAIN_ALIASES}"
write_env_key SSL_EMAIL "${SSL_EMAIL}"

cat >"${SYSTEMD_DIR}/${SERVICE_NAME}.service" <<SERVICEEOF
[Unit]
Description=Notebook automatic deploy
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
EnvironmentFile=${ENV_FILE}
ExecStart=${INSTALL_DIR}/${SERVICE_NAME}
SERVICEEOF

cat >"${SYSTEMD_DIR}/${SERVICE_NAME}.timer" <<TIMEREOF
[Unit]
Description=Run notebook automatic deploy every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Persistent=true
Unit=${SERVICE_NAME}.service

[Install]
WantedBy=timers.target
TIMEREOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.timer"
systemctl start "${SERVICE_NAME}.service"
systemctl status "${SERVICE_NAME}.timer" --no-pager
