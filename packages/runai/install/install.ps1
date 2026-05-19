Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Installing runai (Windows)..."

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  Write-Host "pnpm not found. Enabling pnpm with Corepack..."
  corepack enable pnpm
}

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  Write-Error "pnpm is not available in PATH. Install pnpm from https://pnpm.io/installation and run this script again."
}

$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
  Write-Host "Bun runtime not found. Installing Bun..."
  powershell -c "irm bun.sh/install.ps1 | iex"

  if (-not $env:BUN_INSTALL -or $env:BUN_INSTALL.Trim() -eq "") {
    $env:BUN_INSTALL = Join-Path $HOME ".bun"
  }
  $bunBin = Join-Path $env:BUN_INSTALL "bin"
  if (Test-Path $bunBin) {
    $env:Path = "$bunBin;$env:Path"
  }
}

$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
  Write-Error "Bun runtime installation failed or Bun is not available in PATH. Reopen your terminal and run this script again."
}

Write-Host "Installing runai globally with pnpm..."
pnpm add -g runai

Write-Host ""
Write-Host "Done."
Write-Host "Try:"
Write-Host "  runai recommend"
Write-Host "  runai browse qwen"
Write-Host "  runai serve --model C:\path\to\model.gguf --port 11435"
