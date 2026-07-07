#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH=${1:-notebook-deploy.tgz}

tar \
  --exclude .git \
  --exclude node_modules \
  --exclude .next \
  --exclude .local \
  --exclude uploads \
  --exclude notebook-deploy.tgz \
  --exclude hotfix-deploy.tgz \
  --exclude '*.log' \
  --exclude '*.tsbuildinfo' \
  -czf "${ARCHIVE_PATH}" .
