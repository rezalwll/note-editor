#!/usr/bin/env bash
set -euo pipefail

CALLER_DIR=$(pwd -P)
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
SOURCE_DIR=$(cd -- "${SCRIPT_DIR}/.." && pwd -P)
ARCHIVE_PATH=${1:-notebook-deploy.tgz}
TEMP_ROOT=${RUNNER_TEMP:-${TMPDIR:-/tmp}}

if [[ "${ARCHIVE_PATH}" != /* ]]; then
  ARCHIVE_PATH="${CALLER_DIR}/${ARCHIVE_PATH}"
fi

if ! git -C "${SOURCE_DIR}" rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "Cannot create a deploy archive: ${SOURCE_DIR} has no Git HEAD." >&2
  exit 1
fi

ARCHIVE_DIR=$(dirname -- "${ARCHIVE_PATH}")
mkdir -p "${ARCHIVE_DIR}" "${TEMP_ROOT}"

BUILD_DIR=$(mktemp -d "${TEMP_ROOT%/}/notebook-deploy.XXXXXX")
STAGING_DIR=$(mktemp -d "${ARCHIVE_DIR%/}/.notebook-deploy.XXXXXX")
BUILD_ARCHIVE="${BUILD_DIR}/notebook-deploy.tgz"
ARCHIVE_CONTENTS="${BUILD_DIR}/contents.txt"
STAGED_ARCHIVE="${STAGING_DIR}/notebook-deploy.tgz"

cleanup() {
  rm -rf -- "${BUILD_DIR}" "${STAGING_DIR}"
}

trap cleanup EXIT HUP INT TERM

git -C "${SOURCE_DIR}" archive \
  --format=tar.gz \
  --output="${BUILD_ARCHIVE}" \
  HEAD

tar -tzf "${BUILD_ARCHIVE}" >"${ARCHIVE_CONTENTS}"

for required_entry in package.json scripts/deploy-notebook.sh; do
  if ! grep -Fxq "${required_entry}" "${ARCHIVE_CONTENTS}"; then
    echo "Deploy archive is missing required entry: ${required_entry}" >&2
    exit 1
  fi
done

# Copy beside the destination first so the final replacement is atomic even
# when RUNNER_TEMP and the destination are on different filesystems.
cp -- "${BUILD_ARCHIVE}" "${STAGED_ARCHIVE}"
mv -f -- "${STAGED_ARCHIVE}" "${ARCHIVE_PATH}"

SOURCE_COMMIT=$(git -C "${SOURCE_DIR}" rev-parse HEAD)
cleanup
trap - EXIT HUP INT TERM

printf 'Deploy archive created from %s: %s\n' "${SOURCE_COMMIT}" "${ARCHIVE_PATH}"
