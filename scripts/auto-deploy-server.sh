#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${REPO_URL:-git@github.com:rezalwll/note-editor.git}
BRANCH=${BRANCH:-master}
SOURCE_DIR=${SOURCE_DIR:-/opt/notebook-source}
REPO_DIR=${REPO_DIR:-${SOURCE_DIR}/repo}
STATE_DIR=${STATE_DIR:-/var/lib/notebook-auto-deploy}
ARCHIVE_PATH=${ARCHIVE_PATH:-/root/notebook-deploy.tgz}
DEPLOY_SCRIPT_PATH=${DEPLOY_SCRIPT_PATH:-/root/deploy-notebook.sh}
APP_DIR=${APP_DIR:-/var/www/notebook}
PORT=${PORT:-3000}
FORCE_DEPLOY=${FORCE_DEPLOY:-0}

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_root() {
  if [[ ${EUID} -ne 0 ]]; then
    echo "Run this script as root." >&2
    exit 1
  fi
}

ensure_dependencies() {
  if ! command -v git >/dev/null 2>&1; then
    echo "git is required. Install it first with scripts/install-auto-deploy.sh." >&2
    exit 1
  fi
}

ensure_repo() {
  mkdir -p "${SOURCE_DIR}" "${STATE_DIR}"

  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    log "Cloning ${REPO_URL} (${BRANCH}) into ${REPO_DIR}"
    git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${REPO_DIR}"
    return
  fi

  log "Fetching latest changes for ${BRANCH}"
  git -C "${REPO_DIR}" fetch origin "${BRANCH}"
}

sync_repo() {
  git -C "${REPO_DIR}" checkout -f "${BRANCH}"
  git -C "${REPO_DIR}" reset --hard "origin/${BRANCH}"
  git -C "${REPO_DIR}" clean -fdx
}

should_deploy() {
  local remote_head
  local last_deployed

  remote_head=$(git -C "${REPO_DIR}" rev-parse "origin/${BRANCH}")
  last_deployed=""

  if [[ -f "${STATE_DIR}/last-deployed-commit" ]]; then
    last_deployed=$(<"${STATE_DIR}/last-deployed-commit")
  fi

  if [[ "${FORCE_DEPLOY}" == "1" ]]; then
    log "Force deploy requested for ${remote_head}"
    return 0
  fi

  if [[ "${remote_head}" != "${last_deployed}" ]]; then
    log "New commit detected: ${remote_head}"
    return 0
  fi

  log "No new commit detected. Current deployed commit: ${last_deployed}"
  return 1
}

run_deploy() {
  local deployed_head

  deployed_head=$(git -C "${REPO_DIR}" rev-parse "HEAD")

  log "Packaging source archive"
  tar \
    --exclude .git \
    --exclude node_modules \
    --exclude .next \
    --exclude uploads \
    -czf "${ARCHIVE_PATH}" \
    -C "${REPO_DIR}" .

  install -m 755 "${REPO_DIR}/scripts/deploy-notebook.sh" "${DEPLOY_SCRIPT_PATH}"

  log "Running deploy script for commit ${deployed_head}"
  APP_DIR="${APP_DIR}" \
  ARCHIVE_PATH="${ARCHIVE_PATH}" \
  PORT="${PORT}" \
  "${DEPLOY_SCRIPT_PATH}"

  printf '%s\n' "${deployed_head}" >"${STATE_DIR}/last-deployed-commit"
  log "Deploy completed for ${deployed_head}"
}

require_root
ensure_dependencies
ensure_repo
sync_repo

if should_deploy; then
  run_deploy
fi
