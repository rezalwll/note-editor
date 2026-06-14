#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/var/www/notebook}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/notebook}
STAMP=${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_file() {
  [[ -f "$1" ]] || {
    echo "Missing required file: $1" >&2
    exit 1
  }
}

require_command pg_dump
require_command pg_restore
require_command tar
require_file "${APP_DIR}/.env"

set -a
# shellcheck disable=SC1090
source "${APP_DIR}/.env"
set +a

mkdir -p "${BACKUP_DIR}"

pg_dump "${DATABASE_URL}" --format=custom --no-owner --no-privileges --file "${BACKUP_DIR}/database.dump"
tar -czf "${BACKUP_DIR}/uploads.tgz" -C "${APP_DIR}" uploads

cat >"${BACKUP_DIR}/manifest.txt" <<EOF
created_at_utc=${STAMP}
app_dir=${APP_DIR}
dump_file=database.dump
uploads_file=uploads.tgz
EOF

sha256sum "${BACKUP_DIR}/database.dump" "${BACKUP_DIR}/uploads.tgz" >"${BACKUP_DIR}/sha256sums.txt"

echo "Backup created at ${BACKUP_DIR}"
