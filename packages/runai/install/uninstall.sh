#!/usr/bin/env bash
set -euo pipefail

# Uninstaller for runai installed by https://canirun.ai/runai/install.sh
#
#   curl -fsSL https://canirun.ai/runai/uninstall.sh | bash
#   curl -fsSL https://canirun.ai/runai/uninstall.sh | bash -s -- --purge
#
# --purge also deletes downloaded models and runai data (~/.runai).
# Bun and pnpm are left installed.

PURGE=0
for arg in "$@"; do
  case "${arg}" in
    --purge) PURGE=1 ;;
    -h|--help)
      echo "Usage: uninstall.sh [--purge]"
      echo "  --purge  Also delete downloaded models and runai data (~/.runai)"
      exit 0
      ;;
    *)
      echo "Unknown option: ${arg}" >&2
      exit 1
      ;;
  esac
done

RUNAI_SRC_ROOT="${HOME}/.local/share/runai"
RUNAI_SRC="${RUNAI_SRC_ROOT}/src"
RUNAI_HOME_DIR="${RUNAI_HOME_DIR:-${HOME}/.runai}"

if [ "${PURGE}" = "1" ]; then
  case "${RUNAI_HOME_DIR}" in
    ""|"/"|"${HOME}"|"${HOME}/")
      echo "Refusing to delete ${RUNAI_HOME_DIR:-<empty>}. Check RUNAI_HOME_DIR." >&2
      exit 1
      ;;
  esac
fi

echo "Uninstalling runai..."

if [ "$(uname -s)" = "Darwin" ]; then
  export PNPM_HOME="${PNPM_HOME:-${HOME}/Library/pnpm}"
else
  export PNPM_HOME="${PNPM_HOME:-${HOME}/.local/share/pnpm}"
fi
export PATH="${PNPM_HOME}:${PNPM_HOME}/bin:${PATH}"

# 1. Stop the background API, if it is running.
if command -v runai >/dev/null 2>&1; then
  RUNAI_UPDATE_CHECK=0 RUNAI_TELEMETRY_DISABLED=1 runai stop </dev/null >/dev/null 2>&1 || true
fi

# 2. Remove the npm package, if runai was installed from npm.
if command -v pnpm >/dev/null 2>&1 \
  && pnpm list --global --depth 0 </dev/null 2>/dev/null | grep -q "@canirun/runai"; then
  echo "Removing the @canirun/runai global package..."
  pnpm remove --global @canirun/runai </dev/null >/dev/null 2>&1 \
    || echo "Could not remove it. Run: pnpm remove --global @canirun/runai" >&2
fi

# 3. Remove the command links that point to the GitHub checkout.
#    Other `runai` binaries (such as the unrelated Run:ai CLI) are left alone.
remove_runai_link() {
  local link="$1"
  [ -L "${link}" ] || return 0
  case "$(readlink "${link}")" in
    "${RUNAI_SRC}"/*)
      echo "Removing ${link}"
      rm -f "${link}"
      ;;
  esac
}

PNPM_BIN_DIR=""
if command -v pnpm >/dev/null 2>&1; then
  PNPM_BIN_DIR="$(pnpm bin --global </dev/null 2>/dev/null || true)"
fi

while IFS= read -r link; do
  [ -n "${link}" ] && remove_runai_link "${link}"
done <<EOF
${PNPM_BIN_DIR:+${PNPM_BIN_DIR}/runai}
${PNPM_HOME}/runai
${PNPM_HOME}/bin/runai
$(type -ap runai 2>/dev/null || true)
EOF

# 4. Remove the source checkout.
if [ -d "${RUNAI_SRC}" ]; then
  echo "Removing ${RUNAI_SRC}"
  rm -rf "${RUNAI_SRC}"
fi
rmdir "${RUNAI_SRC_ROOT}" 2>/dev/null || true

# 5. Models and data are kept unless --purge is passed.
if [ -d "${RUNAI_HOME_DIR}" ]; then
  if [ "${PURGE}" = "1" ]; then
    echo "Removing ${RUNAI_HOME_DIR} (models and data)"
    rm -rf "${RUNAI_HOME_DIR}"
  else
    echo ""
    echo "Kept downloaded models and data in ${RUNAI_HOME_DIR}."
    echo "To delete them too, run:"
    echo "  curl -fsSL https://canirun.ai/runai/uninstall.sh | bash -s -- --purge"
  fi
fi

if [ -n "${RUNAI_MODEL_DIR:-}" ] && [ -d "${RUNAI_MODEL_DIR}" ]; then
  case "${RUNAI_MODEL_DIR}" in
    "${RUNAI_HOME_DIR}"/*) ;;
    *) echo "Models in RUNAI_MODEL_DIR (${RUNAI_MODEL_DIR}) were not touched." ;;
  esac
fi

echo ""
echo "Done. Bun and pnpm were left installed."
hash -r
if command -v runai >/dev/null 2>&1; then
  echo "Another runai is still on your PATH: $(command -v runai)"
fi
