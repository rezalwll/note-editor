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
SSL_EMAIL=${SSL_EMAIL:-admin@${DOMAIN:-localhost}}

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
  if swapon --show | grep -q '/swapfile'; then
    return
  fi

  fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
}

install_packages() {
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

  existing_session_secret=$(read_env_value "${APP_DIR}/.env" SESSION_SECRET || true)
  existing_bootstrap_password=$(read_env_value "${APP_DIR}/.env" BOOTSTRAP_PASSWORD || true)

  if [[ -n "${existing_session_secret}" ]]; then
    SESSION_SECRET_VALUE=${existing_session_secret}
  else
    SESSION_SECRET_VALUE=$(openssl rand -hex 32)
  fi

  if [[ "${BOOTSTRAP_PASSWORD}" == "change-me-now" && -n "${existing_bootstrap_password}" ]]; then
    BOOTSTRAP_PASSWORD=${existing_bootstrap_password}
  fi

  cat >"${STAGING_DIR}/.env" <<ENVEOF
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
SESSION_SECRET="${SESSION_SECRET_VALUE}"
BOOTSTRAP_PASSWORD="${BOOTSTRAP_PASSWORD}"
SESSION_COOKIE_SECURE="$([[ -n "${DOMAIN}" ]] && echo "true" || echo "false")"
NEXT_PUBLIC_ENABLE_PWA="false"
UPLOAD_DIR="./uploads"
MAX_UPLOAD_SIZE_MB="10"
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
  npm install --include=dev --no-audit --no-fund
  npm run prisma:generate
  npx prisma migrate resolve --rolled-back 20260614120000_multi_user_accounts >/dev/null 2>&1 || true
  npm run prisma:deploy

  if ! su - postgres -c "psql -d '${DB_NAME}' -tAc 'SELECT 1 FROM users LIMIT 1'" 2>/dev/null | grep -q 1; then
    npm run prisma:seed
  fi

  npm run build
}

activate_release() {
  pm2 delete notebook >/dev/null 2>&1 || true

  rm -rf "${PREVIOUS_DIR}"
  if [[ -d "${APP_DIR}" ]]; then
    mv "${APP_DIR}" "${PREVIOUS_DIR}"
  fi

  mv "${STAGING_DIR}" "${APP_DIR}"
}

configure_nginx() {
  local server_name="_"

  if [[ -n "${DOMAIN}" ]]; then
    server_name="${DOMAIN}"
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
  systemctl restart nginx
}

configure_ssl() {
  if [[ -z "${DOMAIN}" ]]; then
    return
  fi

  mkdir -p /var/www/html

  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "${SSL_EMAIL}" \
    -d "${DOMAIN}"

  if grep -q '^SESSION_COOKIE_SECURE="false"' "${APP_DIR}/.env"; then
    sed -i 's/^SESSION_COOKIE_SECURE="false"/SESSION_COOKIE_SECURE="true"/' "${APP_DIR}/.env"
    pm2 restart notebook --update-env
  fi
}

start_app() {
  cd "${APP_DIR}"
  pm2 delete notebook >/dev/null 2>&1 || true
  pm2 start npm --name notebook -- start -- --hostname 127.0.0.1 --port "${PORT}"
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
ensure_swap
install_packages
prepare_postgres
deploy_files
write_env
build_app
activate_release
configure_nginx
start_app
configure_ssl
print_summary
