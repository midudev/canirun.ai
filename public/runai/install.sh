#!/usr/bin/env bash
set -euo pipefail

OS="$(uname -s)"
case "${OS}" in
  Darwin) OS_LABEL="macOS" ;;
  Linux)
    case "$(uname -r)" in
      *[Mm]icrosoft*|*[Ww][Ss][Ll]*) OS_LABEL="WSL" ;;
      *) OS_LABEL="Linux" ;;
    esac
    ;;
  *)
    echo "Unsupported OS: ${OS}. runai currently supports macOS, Linux, and WSL." >&2
    exit 1
    ;;
esac

echo "Installing runai (${OS_LABEL})..."

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$1"
  else
    echo "curl or wget is required to install runai." >&2
    exit 1
  fi
}

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun runtime not found. Installing Bun..."
  download https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-${HOME}/.bun}"
  export PATH="${BUN_INSTALL}/bin:${PATH}"
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun installation failed. Add ~/.bun/bin to PATH and retry." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
  echo "pnpm not found. Enabling it with Corepack..."
  corepack prepare pnpm@latest --activate >/dev/null 2>&1 || corepack enable pnpm >/dev/null 2>&1 || true
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Installing pnpm..."
  download https://get.pnpm.io/install.sh | env SHELL="${SHELL:-/bin/sh}" sh -
fi

if [ "${OS}" = "Darwin" ]; then
  export PNPM_HOME="${PNPM_HOME:-${HOME}/Library/pnpm}"
else
  export PNPM_HOME="${PNPM_HOME:-${HOME}/.local/share/pnpm}"
fi
export PATH="${PNPM_HOME}:${HOME}/Library/pnpm:${PATH}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm installation failed. Open a new shell and retry." >&2
  exit 1
fi

if ! pnpm bin --global >/dev/null 2>&1; then
  mkdir -p "${PNPM_HOME}"
  pnpm config set global-bin-dir "${PNPM_HOME}"
fi

echo "Installing runai globally with pnpm..."
pnpm add --global runai@latest

echo "Checking the installation..."
runai doctor || {
  echo "runai was installed, but the diagnostic reported a problem." >&2
  echo "Run 'runai doctor' again after fixing the issue shown above." >&2
}

echo ""
echo "Done."
echo "Try:"
echo "  runai"
echo "  runai pull qwen3.5-4b"
echo "  runai run qwen3.5-4b"
