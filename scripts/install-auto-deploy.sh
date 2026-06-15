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

require_root() {
  if [[ ${EUID} -ne 0 ]]; then
    echo "Run this script as root." >&2
    exit 1
  fi
}

require_root

apt-get update
apt-get install -y git

install -d "${INSTALL_DIR}"
install -m 755 "$(dirname "$0")/auto-deploy-server.sh" "${INSTALL_DIR}/${SERVICE_NAME}"

if [[ ! -f "${ENV_FILE}" ]]; then
  cat >"${ENV_FILE}" <<ENVEOF
REPO_URL="${REPO_URL}"
BRANCH="${BRANCH}"
APP_DIR="${APP_DIR}"
PORT="${PORT}"
ENVEOF
fi

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
