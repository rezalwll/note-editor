#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/var/www/notebook}
STAGING_DIR=${STAGING_DIR:-${APP_DIR}.staging}
PREVIOUS_DIR=${PREVIOUS_DIR:-${APP_DIR}.previous}
UPLOADS_DIR=${UPLOADS_DIR:-/var/www/notebook-uploads}
ARCHIVE_PATH=${ARCHIVE_PATH:-/root/notebook-deploy.tgz}
DB_NAME=${DB_NAME:-notebook}
DB_USER=${DB_USER:-notebook_app}
DB_PASS=${DB_PASS:-}
PORT=${PORT:-3000}
BOOTSTRAP_PASSWORD=${BOOTSTRAP_PASSWORD:-change-me-now}
NODE_MAJOR=${NODE_MAJOR:-22}
DOMAIN=${DOMAIN:-}
DOMAIN_ALIASES=${DOMAIN_ALIASES:-}
SSL_EMAIL=${SSL_EMAIL:-admin@${DOMAIN:-localhost}}
DEPLOY_LOCK_FILE=${DEPLOY_LOCK_FILE:-/var/lock/notebook-deploy.lock}
VERIFY_ON_SERVER=${VERIFY_ON_SERVER:-true}

export DEBIAN_FRONTEND=noninteractive

read_env_value() {
  local file_path=$1
  local key=$2

  if [[ ! -f "${file_path}" ]]; then
    return 1
  fi

  sed -n "s/^${key}=\"\\(.*\\)\"$/\\1/p" "${file_path}" | tail -n 1
}

require_root() {
  if [[ ${EUID} -ne 0 ]]; then
    echo "Run this script as root." >&2
    exit 1
  fi
}

ensure_swap() {
  local total_swap_mb
  total_swap_mb=$(awk 'NR > 1 {sum += $3} END {print int(sum / 1024)}' /proc/swaps 2>/dev/null)

  if [[ -z "${total_swap_mb}" ]]; then
    total_swap_mb=0
  fi

  if (( total_swap_mb < 1024 )); then
    if [[ ! -f /swapfile ]]; then
      fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
      chmod 600 /swapfile
      mkswap /swapfile
    fi

    swapon /swapfile 2>/dev/null || true
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    total_swap_mb=$((total_swap_mb + 1024))
  fi

  if (( total_swap_mb < 2048 )); then
    if [[ ! -f /swapfile2 ]]; then
      fallocate -l 1G /swapfile2 || dd if=/dev/zero of=/swapfile2 bs=1M count=1024
      chmod 600 /swapfile2
      mkswap /swapfile2
    fi

    swapon /swapfile2 2>/dev/null || true
    grep -q '^/swapfile2 ' /etc/fstab || echo '/swapfile2 none swap sw 0 0' >> /etc/fstab
  fi
}

install_packages() {
  local command_name
  local missing_dependency=0

  for command_name in curl gpg make cc psql nginx openssl certbot node; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
      missing_dependency=1
      break
    fi
  done

  if (( missing_dependency == 0 )); then
    if ! command -v pm2 >/dev/null 2>&1; then
      npm install -g pm2
    fi
    return
  fi

  apt-get update
  apt-get install -y curl ca-certificates gnupg build-essential postgresql nginx openssl certbot python3-certbot-nginx

  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2
  fi
}

prepare_postgres() {
  systemctl enable postgresql
  if systemctl is-active --quiet postgresql; then
    systemctl reload postgresql || true
  else
    systemctl start postgresql
  fi

  if [[ -z "${DB_PASS}" && -f /root/notebook-db.env ]]; then
    DB_PASS=$(read_env_value /root/notebook-db.env DB_PASS || true)
  fi

  if [[ -z "${DB_PASS}" ]]; then
    DB_PASS=$(openssl rand -hex 24)
  fi

  if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1; then
    su - postgres -c "psql -c \"CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';\""
  else
    su - postgres -c "psql -c \"ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';\""
  fi

  if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1; then
    su - postgres -c "createdb -O '${DB_USER}' '${DB_NAME}'"
  else
    su - postgres -c "psql -c \"ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};\""
  fi

  su - postgres -c "psql -d '${DB_NAME}' -c \"ALTER SCHEMA public OWNER TO ${DB_USER};\""
  su - postgres -c "psql -d '${DB_NAME}' -c \"GRANT ALL ON SCHEMA public TO ${DB_USER};\""
  su - postgres -c "psql -d '${DB_NAME}' -c \"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};\""
  su - postgres -c "psql -d '${DB_NAME}' -c \"GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};\""
  su - postgres -c "psql -d '${DB_NAME}' -c \"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};\""
  su - postgres -c "psql -d '${DB_NAME}' -c \"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};\""
}

deploy_files() {
  if [[ ! -f "${ARCHIVE_PATH}" ]]; then
    echo "Archive not found at ${ARCHIVE_PATH}" >&2
    exit 1
  fi

  rm -rf "${STAGING_DIR}"
  mkdir -p "${STAGING_DIR}" "${UPLOADS_DIR}"
  tar -xzf "${ARCHIVE_PATH}" -C "${STAGING_DIR}"

  if [[ -d "${APP_DIR}/uploads" ]] && [[ ! -L "${APP_DIR}/uploads" ]] && [[ -z "$(find "${UPLOADS_DIR}" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
    cp -a "${APP_DIR}/uploads/." "${UPLOADS_DIR}/"
  fi

  rm -rf "${STAGING_DIR}/uploads"
  ln -s "${UPLOADS_DIR}" "${STAGING_DIR}/uploads"
  rm -rf "${STAGING_DIR}/.local" "${STAGING_DIR}/notebook-deploy.tgz"
}

write_env() {
  local existing_session_secret
  local existing_bootstrap_password
  local existing_email_enabled
  local existing_mail_provider
  local existing_gmail_user
  local existing_gmail_app_password
  local existing_app_base_url
  local existing_mail_from
  local existing_support_email

  existing_session_secret=$(read_env_value "${APP_DIR}/.env" SESSION_SECRET || true)
  existing_bootstrap_password=$(read_env_value "${APP_DIR}/.env" BOOTSTRAP_PASSWORD || true)
  existing_email_enabled=$(read_env_value "${APP_DIR}/.env" EMAIL_ENABLED || true)
  existing_mail_provider=$(read_env_value "${APP_DIR}/.env" MAIL_PROVIDER || true)
  existing_gmail_user=$(read_env_value "${APP_DIR}/.env" GMAIL_USER || true)
  existing_gmail_app_password=$(read_env_value "${APP_DIR}/.env" GMAIL_APP_PASSWORD || true)
  existing_app_base_url=$(read_env_value "${APP_DIR}/.env" APP_BASE_URL || true)
  existing_mail_from=$(read_env_value "${APP_DIR}/.env" MAIL_FROM || true)
  existing_support_email=$(read_env_value "${APP_DIR}/.env" SUPPORT_EMAIL || true)

  if [[ -n "${existing_session_secret}" ]]; then
    SESSION_SECRET_VALUE=${existing_session_secret}
  else
    SESSION_SECRET_VALUE=$(openssl rand -hex 32)
  fi

  if [[ "${BOOTSTRAP_PASSWORD}" == "change-me-now" && -n "${existing_bootstrap_password}" ]]; then
    BOOTSTRAP_PASSWORD=${existing_bootstrap_password}
  fi

  EMAIL_ENABLED_VALUE=${EMAIL_ENABLED:-${existing_email_enabled:-false}}
  MAIL_PROVIDER_VALUE=${MAIL_PROVIDER:-${existing_mail_provider:-}}
  GMAIL_USER_VALUE=${GMAIL_USER:-${existing_gmail_user:-}}
  GMAIL_APP_PASSWORD_VALUE=${GMAIL_APP_PASSWORD:-${existing_gmail_app_password:-}}
  APP_BASE_URL_VALUE=${APP_BASE_URL:-${existing_app_base_url:-}}
  MAIL_FROM_VALUE=${MAIL_FROM:-${existing_mail_from:-}}
  SUPPORT_EMAIL_VALUE=${SUPPORT_EMAIL:-${existing_support_email:-}}

  if [[ -z "${APP_BASE_URL_VALUE}" && -n "${DOMAIN}" ]]; then
    APP_BASE_URL_VALUE="https://${DOMAIN}"
  fi

  cat >"${STAGING_DIR}/.env" <<ENVEOF
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
SESSION_SECRET="${SESSION_SECRET_VALUE}"
BOOTSTRAP_PASSWORD="${BOOTSTRAP_PASSWORD}"
SESSION_COOKIE_SECURE="$([[ -n "${DOMAIN}" ]] && echo "true" || echo "false")"
NEXT_PUBLIC_ENABLE_PWA="false"
UPLOAD_DIR="./uploads"
MAX_UPLOAD_SIZE_MB="10"
EMAIL_ENABLED="${EMAIL_ENABLED_VALUE}"
MAIL_PROVIDER="${MAIL_PROVIDER_VALUE}"
GMAIL_USER="${GMAIL_USER_VALUE}"
GMAIL_APP_PASSWORD="${GMAIL_APP_PASSWORD_VALUE}"
APP_BASE_URL="${APP_BASE_URL_VALUE}"
MAIL_FROM="${MAIL_FROM_VALUE}"
SUPPORT_EMAIL="${SUPPORT_EMAIL_VALUE}"
ENVEOF

  cat >/root/notebook-db.env <<ENVEOF
DB_NAME="${DB_NAME}"
DB_USER="${DB_USER}"
DB_PASS="${DB_PASS}"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
ENVEOF
  chmod 600 /root/notebook-db.env
}

build_app() {
  cd "${STAGING_DIR}"
  rm -rf node_modules .next
  npm ci --include=dev --no-audit --no-fund --prefer-offline
  npx prisma migrate resolve --rolled-back 20260614120000_multi_user_accounts >/dev/null 2>&1 || true
  npm run prisma:deploy

  if ! su - postgres -c "psql -d '${DB_NAME}' -Atqc 'SELECT COUNT(*) FROM users'" 2>/dev/null | grep -qx '[1-9][0-9]*'; then
    npm run prisma:seed
  fi

  if [[ "${VERIFY_ON_SERVER}" == "true" ]]; then
    npm run lint
    npm run typecheck
    npm run test
  fi

  NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=512} npx next build --webpack
}

activate_release() {
  rm -rf "${PREVIOUS_DIR}"
  if [[ -d "${APP_DIR}" ]]; then
    mv "${APP_DIR}" "${PREVIOUS_DIR}"
  fi

  mv "${STAGING_DIR}" "${APP_DIR}"
}

configure_nginx() {
  local server_name="_"
  local -a domains=()

  if [[ -n "${DOMAIN}" ]]; then
    domains+=("${DOMAIN}")
  fi

  if [[ -n "${DOMAIN_ALIASES}" ]]; then
    # shellcheck disable=SC2206
    local aliases=( ${DOMAIN_ALIASES} )
    domains+=("${aliases[@]}")
  fi

  if [[ ${#domains[@]} -gt 0 ]]; then
    server_name="${domains[*]}"
  fi

  cat >/etc/nginx/sites-available/notebook <<NGINXEOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${server_name};

    client_max_body_size 20M;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINXEOF

  ln -sf /etc/nginx/sites-available/notebook /etc/nginx/sites-enabled/notebook
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  else
    systemctl start nginx
  fi
}

configure_ssl() {
  local -a certbot_domains=()

  if [[ -z "${DOMAIN}" ]]; then
    return
  fi

  mkdir -p /var/www/html

  certbot_domains+=(-d "${DOMAIN}")

  if [[ -n "${DOMAIN_ALIASES}" ]]; then
    # shellcheck disable=SC2206
    local aliases=( ${DOMAIN_ALIASES} )
    local alias
    for alias in "${aliases[@]}"; do
      certbot_domains+=(-d "${alias}")
    done
  fi

  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "${SSL_EMAIL}" \
    "${certbot_domains[@]}"

  if grep -q '^SESSION_COOKIE_SECURE="false"' "${APP_DIR}/.env"; then
    sed -i 's/^SESSION_COOKIE_SECURE="false"/SESSION_COOKIE_SECURE="true"/' "${APP_DIR}/.env"
    pm2 restart notebook --update-env
  fi
}

start_app() {
  cd "${APP_DIR}"
  if pm2 describe notebook >/dev/null 2>&1; then
    pm2 restart notebook --update-env
  else
    pm2 start npm --name notebook -- start -- --hostname 127.0.0.1 --port "${PORT}"
  fi
  pm2 save
  env PATH="$PATH:/usr/bin" pm2 startup systemd -u root --hp /root >/dev/null
}

print_summary() {
  local server_ip
  local attempt

  server_ip=$(hostname -I | awk '{print $1}')

  echo
  echo "App should be available at: http://${server_ip}"
  echo "App upstream is running on: http://127.0.0.1:${PORT}"
  echo "Public IP expected by you: http://185.18.214.137"
  echo
  pm2 status
  echo

  for attempt in $(seq 1 15); do
    if curl -fsSI "http://127.0.0.1:${PORT}" >/tmp/notebook-healthcheck.txt 2>/dev/null; then
      cat /tmp/notebook-healthcheck.txt
      return
    fi

    sleep 2
  done

  echo "Warning: app did not answer on http://127.0.0.1:${PORT} before the health-check timeout." >&2
}

require_root
exec 9>"${DEPLOY_LOCK_FILE}"

if ! flock -n 9; then
  echo "Another notebook deployment is already running." >&2
  exit 1
fi

ensure_swap
install_packages
prepare_postgres
deploy_files
write_env
build_app
configure_nginx
activate_release
start_app
configure_ssl
print_summary
