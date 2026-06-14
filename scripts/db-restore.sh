#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/var/www/notebook}
BACKUP_DIR=${1:-}
SKIP_UPLOADS=${SKIP_UPLOADS:-false}

if [[ -z "${BACKUP_DIR}" ]]; then
  echo "Usage: $0 /path/to/backup-dir" >&2
  exit 1
fi

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

require_command pg_restore
require_command psql
require_command tar
require_file "${APP_DIR}/.env"
require_file "${BACKUP_DIR}/database.dump"

set -a
# shellcheck disable=SC1090
source "${APP_DIR}/.env"
set +a

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'EOF'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
GRANT ALL ON SCHEMA public TO public;
EOF

pg_restore --clean --if-exists --no-owner --no-privileges --dbname "${DATABASE_URL}" "${BACKUP_DIR}/database.dump"

if [[ "${SKIP_UPLOADS}" != "true" ]]; then
  require_file "${BACKUP_DIR}/uploads.tgz"
  mkdir -p "${APP_DIR}"
  rm -rf "${APP_DIR}/uploads"
  tar -xzf "${BACKUP_DIR}/uploads.tgz" -C "${APP_DIR}"
fi

echo "Restore completed from ${BACKUP_DIR}"
