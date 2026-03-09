<div align="center">

<img src="public/favicon.svg" alt="CanIRun.ai" width="80" height="80" />

# CanIRun.ai

**Find out which AI models your hardware can run locally — in seconds.**

Your browser detects your CPU, RAM and GPU automatically.\
No installs, no benchmarks, no guesswork.

[**canirun.ai**](https://canirun.ai) · [Report Bug](https://github.com/midudev/canirun.ai/issues) · [Request Model](https://github.com/midudev/canirun.ai/issues)

</div>

---

## Why

Cloud AI APIs are expensive, rate-limited, and send your data to third parties. Running models locally gives you **privacy, speed, and zero cost per token** — but only if your hardware is up to the job.

CanIRun.ai answers that question instantly. Open the site, let it detect your hardware, and see a personalized compatibility report for **68+ open-weight models** with grades from S to F.

## How It Works

```
Browser APIs → Hardware Detection → Model Matching → Personalized Grades
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

- **Zero-install hardware detection** — CPU cores, RAM, GPU model, VRAM and memory bandwidth identified from the browser
- **68+ AI models** — from TinyLlama 1.1B to Llama 4 Maverick 128E and Qwen3 Coder 480B
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

Models from **Meta, Google, Alibaba, DeepSeek, Mistral AI, Microsoft, NVIDIA, Liquid AI** and the community:

| Family | Models |
|---|---|
| Llama | 3.1 8B, 3.1 405B, 3.2 1B/3B/11B-Vision, 3.3 70B, 4 Scout, 4 Maverick |
| Qwen | 2.5 7B–72B, 2.5 Coder, 3 1.7B–235B, 3.5 0.8B–397B, 3 Coder 480B |
| Gemma | 2 2B/9B/27B, 3 1B/4B/12B/27B |
| DeepSeek | R1 1.5B–32B, V3.1, V3.2 |
| Mistral | 7B, Nemo 12B, Small 24B, Mixtral 8x7B/8x22B, Devstral |
| Phi | 3.5 Mini, 4 14B, 4 Mini Reasoning |
| Others | Nemotron, GLM-4, OLMo 2, SmolLM3, LFM2, EXAONE, Kimi K2, GPT-OSS |

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
| `pnpm scrape` | Fetch model stats from HuggingFace (requires [Bun](https://bun.sh)) |

## Project Structure

```
src/
├── data/
│   ├── models.ts          # 68+ AI model definitions with quant calculations
│   └── hf-stats.json      # HuggingFace download/like counts
├── lib/
│   ├── hardware.ts         # Client-side hardware detection engine
│   └── og.ts               # OG image generation utilities
├── pages/
│   ├── index.astro         # Home — model grid with filters & search
│   ├── tier.astro          # Tier list — S–F ranking with image export
│   ├── model/[id].astro    # Model detail — quants, compatibility, install
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

- **Add a model** — add an entry to `src/data/models.ts` following the existing pattern
- **Improve hardware detection** — extend the GPU/Apple/Mobile databases in `src/lib/hardware.ts`
- **Report inaccurate results** — open an issue with your hardware info and the model in question
- **Fix bugs or improve UI** — PRs are appreciated

## Author

Created by [**midudev**](https://midu.dev) · [@midudev](https://twitter.com/midudev)

## License

MIT
