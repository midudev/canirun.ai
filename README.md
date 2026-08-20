<div align="center">

<img src="public/favicon.svg" alt="CanIRun.ai" width="80" height="80" />

# CanIRun.ai

**The best AI models for your machine — recommended in seconds.**

Your browser detects your CPU, RAM and GPU automatically, then we recommend the
top open models to run locally for each use case: coding, chat, reasoning and vision.\
No installs, no benchmarks, no guesswork.

[**canirun.ai**](https://canirun.ai) · [Report Bug](https://github.com/midudev/canirun.ai/issues) · [Request Model](https://github.com/midudev/canirun.ai/issues)

</div>

---

## Why

Cloud AI APIs are expensive, rate-limited, and send your data to third parties. Running models locally gives you **privacy, speed, and zero cost per token** — but only if your hardware is up to the job.

CanIRun.ai answers that question instantly. Open the site, let it detect your hardware, and get a curated set of **best-pick recommendations** grouped by use case (general, coding, reasoning, vision and lightweight) — the top open models that actually run well on *your* device. Prefer to explore? Switch to **Browse all** for the full compatibility report across **55+ open-weight models** with grades from S to F.

## How It Works

```
Browser APIs → Hardware Detection → Per-Use-Case Ranking → Best-Pick Recommendations
```

1. **Hardware detection** runs entirely client-side using WebGL, WebGPU, `navigator.deviceMemory` and a lightweight CPU micro-benchmark.
2. Each model's VRAM requirements are calculated across **7 quantization levels** (Q2_K → F16) from parameter count.
3. A scoring algorithm combines run status, estimated tokens/second, memory headroom and model size into a **letter grade (S–F)**.
4. Results are displayed instantly — nothing is sent to any server.

### Supported hardware

| Platform | Detection method |
|---|---|
| **NVIDIA** RTX 30xx / 40xx / 50xx, A100, H100 | WebGL renderer string + GPU database |
| **AMD** RX 6xxx / 7xxx / 9xxx | WebGL renderer string + GPU database |
| **Intel** Arc A-series | WebGL renderer string + GPU database |
| **Apple Silicon** M1–M4 (Pro, Max, Ultra) | WebGL + unified memory lookup |
| **Mobile** (iOS / Android) | Screen resolution, benchmark, Adreno/Mali/Immortalis DB |

## Features

- **Best-pick recommendations** — the top open models for your device, grouped by use case (general, coding, reasoning, vision, lightweight), quality-ranked but gated by what actually runs well
- **Zero-install hardware detection** — CPU cores, RAM, GPU model, VRAM and memory bandwidth identified from the browser
- **55+ curated open models** — from Qwen 3 0.6B up to GLM-5.2 753B and Kimi K2.6 1T, pruned to the ones worth running (no stale duplicates)
- **7 quantization levels per model** — Q2_K, Q3_K_M, Q4_K_M, Q5_K_M, Q6_K, Q8_0, F16 with computed VRAM sizes
- **S–F grading system** — instant letter grade based on your hardware vs. model requirements
- **Tokens/second estimates** — approximate inference speed from memory bandwidth data
- **Filters** — by use case (chat, code, reasoning, vision), provider, architecture (dense / MoE), features (tool use, thinking)
- **Search & keyboard shortcuts** — `/` to search, `j`/`k` to navigate, `Enter` to open, `v` to switch view
- **Three view modes** — compact grid, detailed grid, and list
- **Tier list** — shareable S–F tier list you can export as an image
- **Model detail pages** — per-quant compatibility table, one-click Ollama / LM Studio / llama.cpp install commands
- **OG images** — dynamically generated social preview images for every model
- **SEO** — Schema.org structured data, sitemap, semantic HTML
- **View Transitions** — smooth page animations via Astro Client Router

## Model Catalog

Models from **Meta, Google, Alibaba, DeepSeek, Mistral AI, Microsoft, NVIDIA, Liquid AI, Z.ai, Moonshot AI, OpenAI** and the community:

| Family | Models |
|---|---|
| Llama | 3.1 8B, 3.2 1B/3B, 3.3 70B, 4 Scout/Maverick |
| Qwen | 2.5 Coder 1.5B/7B, 3 0.6B–235B, 3 Coder 30B/480B, 3-VL 4B/8B/30B-A3B, 3.5 0.8B–397B, 3.6 27B/35B-A3B |
| Gemma | 3 1B/4B/12B/27B, 4 E2B/E4B/26B-A4B/31B |
| DeepSeek | R1 1.5B–32B/671B, V3.2, V4 Flash |
| Mistral | Ministral 8B, Nemo 12B, Small 3.1 24B, Devstral Small 2 |
| GLM | 4 9B, 4.5 Air, 4.6, 5.2 |
| Others | Phi-4, Nemotron, OLMo 2, SmolLM3, LFM2, Kimi K2.6, GPT-OSS |

## API

The same compatibility engine that powers the site is exposed as a small JSON API,
so you can integrate CanIRun.ai into dashboards, PC configurators, CLI tools or
custom assistants. All endpoints are CORS-enabled and return `application/json`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/models` | List the model catalog. Optional `?provider=` and `?useCase=` filters. |
| `GET` | `/api/models/:id` | Full metadata for one model (accepts fuzzy ids, e.g. `llama-3.1-8b`). |
| `POST` | `/api/compatibility` | Check one hardware profile against one model. |
| `POST` | `/api/recommend` | Rank the best compatible models for a hardware profile. |

**Hardware profile** — all `POST` endpoints accept a `hardware` object. Provide a GPU
name and we enrich VRAM/bandwidth from the internal database, or pass explicit values:

```jsonc
{
  "hardware": {
    "cpu": { "name": "AMD Ryzen 7 5800X", "cores": 8, "threads": 16 },
    "ramGb": 32,
    "gpu": { "name": "NVIDIA RTX 3060", "vramGb": 12, "memoryBandwidthGbps": 360 }
  }
}
```

Apple Silicon (`"gpu": { "name": "Apple M3 Max" }`) is detected automatically and
treated as unified memory. Omit `gpu` for a CPU / integrated-GPU profile.

### `POST /api/compatibility`

```bash
curl -X POST https://canirun.ai/api/compatibility \
  -H 'content-type: application/json' \
  -d '{ "hardware": { "ramGb": 32, "gpu": { "name": "NVIDIA RTX 3060" } },
        "modelId": "llama-3.1-8b", "quantization": "Q4_K_M" }'
```

```jsonc
{
  "compatible": true,
  "status": "comfortable",          // comfortable | tight | cpu-offload | insufficient | unknown
  "grade": "A",                     // S–F
  "score": 82,
  "modelId": "llama3.1-8b",
  "quantization": "Q4_K_M",
  "recommendedQuantization": "Q8_0",
  "estimated": {
    "tokensPerSecond": 55,
    "modelSizeGb": 3.9,
    "vramRequiredGb": 4.6,
    "ramRequiredGb": 7.5,
    "memoryHeadroomGb": 7.4
  },
  "notes": ["The model should fit comfortably in GPU memory.", "..."]
}
```

`quantization` is optional — when omitted, the best-fitting quant is used.

### `POST /api/recommend`

```bash
curl -X POST https://canirun.ai/api/recommend \
  -H 'content-type: application/json' \
  -d '{ "hardware": { "ramGb": 64, "gpu": { "name": "RTX 4090", "vramGb": 24 } },
        "useCase": "code", "limit": 5 }'
```

Returns a ranked `recommendations` array (each with quant, grade, status and
estimated tokens/second). `useCase` and `limit` (1–25, default 5) are optional.

## Tech Stack

| | Technology | Purpose |
|---|---|---|
| 🚀 | [Astro 5](https://astro.build) | Static site generation with islands architecture |
| 🎨 | [Tailwind CSS 4](https://tailwindcss.com) | Utility-first styling |
| 🔤 | [Geist](https://vercel.com/font) | Sans, Mono and Pixel typefaces |
| 🖼️ | [Satori](https://github.com/vercel/satori) + [resvg](https://github.com/nicolo-ribaudo/resvg-js) | OG image generation (JSX → SVG → PNG) |
| 📸 | [@zumer/snapdom](https://github.com/nicolo-ribaudo/snapdom) | Tier list export to image |
| 🗺️ | [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/) | Automatic sitemap generation |

## Getting Started

**Prerequisites:** [Node.js](https://nodejs.org) 18+ and [pnpm](https://pnpm.io)

```bash
# Clone the repo
git clone https://github.com/midudev/canirun.ai.git
cd canirun.ai

# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

Open [localhost:4321](http://localhost:4321) to see the site.

## Commands

| Command | Action |
|---|---|
| `pnpm dev` | Start dev server at `localhost:4321` |
| `pnpm build` | Build production site to `./dist/` |
| `pnpm preview` | Preview production build locally |
| `pnpm scrape` | Fetch model stats from HuggingFace |

## Project Structure

```
packages/
├── models/
│   └── src/index.ts        # 90+ AI model definitions with quant calculations (edit here)
├── compatibility/           # Hardware ↔ model compatibility scoring engine
└── runai/                   # CLI for running models locally

src/
├── data/
│   ├── models.ts            # Re-exports @canirun/models (built from packages/models)
│   └── hf-stats.json        # HuggingFace download/like counts
├── lib/
│   ├── hardware.ts         # Client-side hardware detection engine
│   └── og.ts               # OG image generation utilities
├── pages/
│   ├── index.astro         # Home — model grid with filters & search
│   ├── tier.astro          # Tier list — S–F ranking with image export
│   ├── model/[id].astro    # Model detail — quants, compatibility, install
│   ├── api/                # JSON API — models, compatibility, recommend
│   └── og/                 # Dynamic OG image endpoints
├── components/
│   └── NavHeader.astro     # Site navigation
├── layouts/
│   └── Layout.astro        # Base layout with SEO, fonts, transitions
├── icons/                  # SVG icon components
└── styles/
    └── global.css          # Theme tokens, Geist fonts, dark mode
```

## Contributing

Contributions are welcome! Some ways to help:

- **Add a model** — add an entry to the `STATIC_MODELS` array in `packages/models/src/index.ts` following the existing pattern (the `AIModel` interface at the top of that file).
- **Improve hardware detection** — extend the GPU/Apple/Mobile databases in `src/lib/hardware.ts`
- **Report inaccurate results** — open an issue with your hardware info and the model in question
- **Fix bugs or improve UI** — PRs are appreciated

## Author

Created by [**midudev**](https://midu.dev) · [@midudev](https://twitter.com/midudev)

## License

MIT
