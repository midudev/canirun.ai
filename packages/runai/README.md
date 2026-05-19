# runai

Local AI runtime with hardware-aware model recommendations and an OpenAI-compatible API.

## Features

- GGUF model recommendations optimized for your machine.
- Guided model installation from the official catalog.
- Local terminal chat with streaming output.
- OpenAI-compatible local API (`/v1/chat/completions`, `/v1/completions`, `/v1/models`).
- `doctor` command to validate runtime, environment, and installed models.

## Requirements

- Supported installer platforms: macOS, Linux, and Windows.
- Model recommendation quality is currently optimized for macOS/Apple Silicon.
- [pnpm](https://pnpm.io/) installed.
- [Bun](https://bun.sh/) runtime installed.

## Development Setup

```bash
cd packages/runai
pnpm install
```

To run the local CLI binary:

```bash
pnpm run dev -- --help
```

## Quick Start

### 1) Recommend and install models

```bash
pnpm run recommend
```

Useful options:

```bash
pnpm run recommend -- --top 5
pnpm run recommend -- --json
pnpm run recommend -- --install all
pnpm run recommend -- --install 1,2
pnpm run recommend -- --install qwen3-0.6b
```

### 2) Browse the catalog

```bash
pnpm run browse -- qwen --limit 10
pnpm run browse -- --json
```

### 3) Pull a GGUF model manually

```bash
pnpm run dev -- pull "https://huggingface.co/<repo>/resolve/main/model.gguf?download=true" --name my-model.gguf
```

### 4) Start local interactive chat

```bash
pnpm run dev -- chat
```

You can also pass a model path or ID:

```bash
pnpm run dev -- chat --model /path/to/model.gguf
pnpm run dev -- chat --model qwen3-0.6b
```

### 5) Start the OpenAI-compatible API

```bash
pnpm run serve -- --model /path/to/model.gguf --port 11435
```

Equivalent alias:

```bash
pnpm run api -- --model /path/to/model.gguf
```

Endpoints:

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/completions`

`chat.completions` example:

```bash
curl -s http://localhost:11435/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model":"local",
    "messages":[{"role":"user","content":"Give me a short sentence about local AI"}],
    "stream": false
  }'
```

Streaming example:

```bash
curl -N http://localhost:11435/v1/chat/completions \
  -H "content-type: application/json" \
  -d '{
    "model":"local",
    "messages":[{"role":"user","content":"Count to 5"}],
    "stream": true
  }'
```

## Doctor Command

Validates runtime, directory access, `node-llama-cpp`, and model consistency:

```bash
pnpm run dev -- doctor
pnpm run dev -- doctor --json
pnpm run dev -- doctor --model /path/to/model.gguf
```

## Environment Variables

- `RUNAI_MODEL_DIR`: model directory (default: `~/.runai/models`).
- `RUNAI_HOME_DIR`: home directory (default: `~/.runai`).
- `RUNAI_DB_PATH`: SQLite path for installed models (default: `~/.runai/runai.db`).
- `RUNAI_PORT`: default API port (default: `11435`).
- `RUNAI_MODEL`: default model for `serve/api`.
- `RUNAI_TELEMETRY_DISABLED=1`: disables anonymous telemetry.
- `RUNAI_TELEMETRY_ENDPOINT`: telemetry endpoint (optional).

## Package Scripts

```bash
pnpm run dev
pnpm run build
pnpm run test
pnpm run recommend
pnpm run browse
pnpm run serve
pnpm run api
```

Smoke test:

```bash
./scripts/smoke.sh
```

## Quick Installer

macOS / Linux:

```bash
./install/install.sh
```

Windows (PowerShell):

```powershell
.\install\install.ps1
```

These scripts install the Bun runtime if needed and then install `runai` globally with pnpm.
