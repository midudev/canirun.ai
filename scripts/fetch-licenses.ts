#!/usr/bin/env -S pnpm exec tsx
/**
 * Fetch license information for all models from HuggingFace API.
 * Outputs src/data/licenses.json with { [modelId]: "license name" }
 *
 * Usage:  pnpm exec tsx scripts/fetch-licenses.ts
 */

const HF_API = "https://huggingface.co/api/models";
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": "canirun-scraper/1.0" };
  if (HF_TOKEN) headers["Authorization"] = `Bearer ${HF_TOKEN}`;
  return headers;
}

const MODEL_HF_REPOS: Record<string, string> = {
  "qwen3.5-0.8b": "lmstudio-community/Qwen3.5-0.8B-GGUF",
  "qwen3-0.6b": "lmstudio-community/Qwen3-0.6B-GGUF",
  "llama3.2-1b": "meta-llama/Llama-3.2-1B",
  "gemma3-1b": "google/gemma-3-1b-it",
  "tinyllama-1.1b": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  "qwen2.5-coder-1.5b": "Qwen/Qwen2.5-Coder-1.5B-Instruct",
  "deepseek-r1-1.5b": "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
  "qwen3-1.7b": "Qwen/Qwen3-1.7B",
  "qwen3.5-2b": "lmstudio-community/Qwen3.5-2B-GGUF",
  "gemma2-2b": "google/gemma-2-2b-it",
  "llama3.2-3b": "meta-llama/Llama-3.2-3B",
  "smollm3-3b": "HuggingFaceTB/SmolLM3-3B",
  "phi-3.5-mini": "microsoft/Phi-3.5-mini-instruct",
  "phi-4-mini-reasoning": "microsoft/Phi-4-mini-reasoning",
  "qwen3-4b": "Qwen/Qwen3-4B",
  "gemma3-4b": "google/gemma-3-4b-it",
  "qwen3.5-4b": "lmstudio-community/Qwen3.5-4B-GGUF",
  "gemma4-e2b-it": "lmstudio-community/gemma-4-E2B-it-GGUF",
  "gemma4-e2b": "google/gemma-4-E2B",
  "gemma4-e4b-it": "lmstudio-community/gemma-4-E4B-it-GGUF",
  "gemma4-e4b": "google/gemma-4-E4B",
  "mistral-7b": "mistralai/Mistral-7B-Instruct-v0.3",
  "qwen2.5-7b": "Qwen/Qwen2.5-7B-Instruct",
  "qwen2.5-coder-7b": "Qwen/Qwen2.5-Coder-7B-Instruct",
  "deepseek-r1-7b": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
  "llama3.1-8b": "meta-llama/Llama-3.1-8B-Instruct",
  "qwen3-8b": "Qwen/Qwen3-8B",
  "ministral-8b": "mistralai/Ministral-8B-Instruct-2410",
  "gemma2-9b": "google/gemma-2-9b-it",
  "glm-4-9b": "THUDM/glm-4-9b-chat",
  "nemotron-nano-9b": "nvidia/NVIDIA-Nemotron-Nano-9B-v2",
  "qwen3.5-9b": "lmstudio-community/Qwen3.5-9B-GGUF",
  "llama3.2-11b-vision": "meta-llama/Llama-3.2-11B-Vision-Instruct",
  "gemma3-12b": "google/gemma-3-12b-it",
  "mistral-nemo-12b": "mistralai/Mistral-Nemo-Instruct-2407",
  "qwen2.5-14b": "Qwen/Qwen2.5-14B-Instruct",
  "phi-4-14b": "microsoft/phi-4",
  "qwen3-14b": "Qwen/Qwen3-14B",
  "deepseek-r1-14b": "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B",
  "llama4-scout-17b": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "gpt-oss-20b": "openai/gpt-oss-20b",
  "lfm2-24b": "LiquidAI/LFM2-24B-A2B",
  "devstral-small-2-24b": "mistralai/Devstral-Small-2-24B-Instruct-2512",
  "mistral-small-24b": "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
  "gemma2-27b": "google/gemma-2-27b-it",
  "gemma3-27b": "google/gemma-3-27b-it",
  "gemma4-26b-a4b-it": "lmstudio-community/gemma-4-26B-A4B-it-GGUF",
  "gemma4-26b-a4b": "google/gemma-4-26B-A4B",
  "qwen3.5-27b": "lmstudio-community/Qwen3.5-27B-GGUF",
  "qwen3-30b-a3b": "Qwen/Qwen3-30B-A3B",
  "nemotron-nano-30b": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
  "gemma4-31b-it": "lmstudio-community/gemma-4-31B-it-GGUF",
  "gemma4-31b": "google/gemma-4-31B",
  "qwen2.5-32b": "Qwen/Qwen2.5-32B-Instruct",
  "qwen2.5-coder-32b": "Qwen/Qwen2.5-Coder-32B-Instruct",
  "qwen3-32b": "Qwen/Qwen3-32B",
  "deepseek-r1-32b": "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
  "exaone-4-32b": "LGAI-EXAONE/EXAONE-4.0-32B",
  "olmo2-32b": "allenai/OLMo-2-0325-32B-Instruct",
  "command-r-35b": "CohereForAI/c4ai-command-r-v01",
  "qwen3.5-35b-a3b": "lmstudio-community/Qwen3.5-35B-A3B-GGUF",
  "mixtral-8x7b": "mistralai/Mixtral-8x7B-Instruct-v0.1",
  "llama3.3-70b": "meta-llama/Llama-3.3-70B-Instruct",
  "gpt-oss-120b": "openai/gpt-oss-120b",
  "devstral-2-123b": "mistralai/Devstral-2-123B-Instruct-2512",
  "qwen2.5-72b": "Qwen/Qwen2.5-72B-Instruct",
  "qwen3.5-122b-a10b": "lmstudio-community/Qwen3.5-122B-A10B-GGUF",
  "mixtral-8x22b": "mistralai/Mixtral-8x22B-Instruct-v0.1",
  "llama4-maverick-17b-128e": "meta-llama/Llama-4-Maverick-17B-128E-Instruct",
  "qwen3-235b-a22b": "Qwen/Qwen3-235B-A22B",
  "qwen3.5-397b-a17b": "Qwen/Qwen3.5-397B-A17B",
  "llama3.1-405b": "meta-llama/Llama-3.1-405B-Instruct",
  "qwen3-coder-480b": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
  "deepseek-r1": "deepseek-ai/DeepSeek-R1",
  "deepseek-v3.1": "deepseek-ai/DeepSeek-V3-0324",
  "deepseek-v3.2": "deepseek-ai/DeepSeek-V3.2",
  "kimi-k2": "moonshotai/Kimi-K2-Instruct",
};

const LICENSE_DISPLAY: Record<string, string> = {
  "apache-2.0": "Apache 2.0",
  "mit": "MIT",
  "cc-by-4.0": "CC BY 4.0",
  "cc-by-nc-4.0": "CC BY-NC 4.0",
  "cc-by-sa-4.0": "CC BY-SA 4.0",
  "cc-by-nc-sa-4.0": "CC BY-NC-SA 4.0",
  "openrail": "OpenRAIL",
  "openrail++": "OpenRAIL++",
  "bigscience-openrail-m": "BigScience OpenRAIL-M",
  "llama3": "Llama 3 Community",
  "llama3.1": "Llama 3.1 Community",
  "llama3.2": "Llama 3.2 Community",
  "llama3.3": "Llama 3.3 Community",
  "llama4": "Llama 4 Community",
  "gemma": "Gemma License",
  "other": "Custom",
};

async function fetchLicense(repoId: string): Promise<string | null> {
  try {
    const resp = await fetch(`${HF_API}/${repoId}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      console.error(`  ⚠ HTTP ${resp.status} for ${repoId}`);
      return null;
    }
    const data = await resp.json();

    // license from cardData
    if (data.cardData?.license) {
      return data.cardData.license;
    }

    // license from tags
    const tags: string[] = data.tags || [];
    for (const tag of tags) {
      if (tag.startsWith("license:")) {
        return tag.replace("license:", "");
      }
    }

    return null;
  } catch (e: any) {
    console.error(`  ⚠ Error fetching ${repoId}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("Fetching licenses from HuggingFace...\n");

  const licenses: Record<string, string> = {};
  const entries = Object.entries(MODEL_HF_REPOS);

  for (let i = 0; i < entries.length; i++) {
    const [modelId, repoId] = entries[i];
    process.stdout.write(`[${i + 1}/${entries.length}] ${repoId}...`);

    const rawLicense = await fetchLicense(repoId);
    if (rawLicense) {
      const display = LICENSE_DISPLAY[rawLicense] || rawLicense;
      licenses[modelId] = display;
      console.log(` ✓ ${display}`);
    } else {
      console.log(" ✗ no license found");
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const outputPath = path.resolve(import.meta.dirname ?? ".", "..", "src", "data", "licenses.json");
  await fs.writeFile(outputPath, JSON.stringify(licenses, null, 2));

  console.log(`\n✅ Wrote ${Object.keys(licenses).length} licenses to src/data/licenses.json`);
}

main().catch(console.error);
