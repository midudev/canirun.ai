#!/usr/bin/env bash
set -euo pipefail

OS="$(uname -s)"
case "${OS}" in
  Darwin) OS_LABEL="macOS" ;;
  Linux) OS_LABEL="Linux" ;;
  *)
    echo "Unsupported OS: ${OS}"
    echo "Use the Windows installer on PowerShell: ./install/install.ps1"
    exit 1
    ;;
esac

echo "Installing runai (${OS_LABEL})..."

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Enabling pnpm with Corepack..."
  corepack enable pnpm
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not available in PATH."
  echo "Install pnpm from https://pnpm.io/installation and run this installer again."
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun runtime not found. Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun runtime installation failed or Bun is not in PATH."
  echo "Please add ~/.bun/bin to your PATH and run this installer again."
  exit 1
fi

echo "Installing runai globally with pnpm..."
pnpm add -g runai

echo ""
echo "Done."
echo "Try:"
echo "  runai recommend"
echo "  runai browse qwen"
echo "  runai serve --model /path/to/model.gguf --port 11435"
