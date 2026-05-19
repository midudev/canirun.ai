#!/usr/bin/env -S pnpm exec tsx
/**
 * HuggingFace model scraper for CanIRun.ai
 * Fetches model metadata and computes RAM/VRAM requirements.
 * Outputs data/models.json consumed by the Astro site.
 *
 * Usage:
 *   pnpm scrape
 *   pnpm scrape -- --discover
 *   pnpm scrape -- --discover -n 50
 */

import { writeFile } from "node:fs/promises";

const HF_API = "https://huggingface.co/api/models";
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": "canirun-scraper/1.0" };
  if (HF_TOKEN) headers["Authorization"] = `Bearer ${HF_TOKEN}`;
  return headers;
}

// ── Target models ─────────────────────────────────────────

const TARGET_MODELS = [
  // Meta Llama
  "meta-llama/Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.1-70B-Instruct",
  "meta-llama/Llama-3.1-405B-Instruct",
  "meta-llama/Llama-3.2-1B",
  "meta-llama/Llama-3.2-3B",
  "meta-llama/Llama-3.2-11B-Vision-Instruct",
  "meta-llama/Llama-3.3-70B-Instruct",
  "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct",
  "meta-llama/CodeLlama-7b-Instruct-hf",
  "meta-llama/CodeLlama-13b-Instruct-hf",
  "meta-llama/CodeLlama-34b-Instruct-hf",
  // Mistral
  "mistralai/Mistral-7B-Instruct-v0.3",
  "mistralai/Mixtral-8x7B-Instruct-v0.1",
  "mistralai/Mixtral-8x22B-Instruct-v0.1",
  "mistralai/Mistral-Small-24B-Instruct-2501",
  "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
  "mistralai/Ministral-8B-Instruct-2410",
  "mistralai/Mistral-Nemo-Instruct-2407",
  // Qwen 2.5
  "Qwen/Qwen2.5-7B-Instruct",
  "Qwen/Qwen2.5-14B-Instruct",
  "Qwen/Qwen2.5-32B-Instruct",
  "Qwen/Qwen2.5-72B-Instruct",
  "Qwen/Qwen2.5-Coder-1.5B-Instruct",
  "Qwen/Qwen2.5-Coder-7B-Instruct",
  "Qwen/Qwen2.5-Coder-14B-Instruct",
  "Qwen/Qwen2.5-Coder-32B-Instruct",
  "Qwen/Qwen2.5-VL-3B-Instruct",
  "Qwen/Qwen2.5-VL-7B-Instruct",
  // Qwen 3
  "Qwen/Qwen3-0.6B",
  "Qwen/Qwen3-1.7B",
  "Qwen/Qwen3-4B",
  "Qwen/Qwen3-8B",
  "Qwen/Qwen3-14B",
  "Qwen/Qwen3-32B",
  "Qwen/Qwen3-30B-A3B",
  "Qwen/Qwen3-235B-A22B",
  "Qwen/Qwen3-Coder-480B-A35B-Instruct",
  // Qwen 3.5
  "Qwen/Qwen3.5-27B",
  "Qwen/Qwen3.5-35B-A3B",
  "Qwen/Qwen3.5-122B-A10B-FP8",
  "Qwen/Qwen3.5-397B-A17B",
  "Qwen/Qwen3.5-0.8B",
  "Qwen/Qwen3.5-2B",
  "Qwen/Qwen3.5-4B",
  "Qwen/Qwen3.5-9B",
  // Microsoft Phi
  "microsoft/Phi-3.5-mini-instruct",
  "microsoft/phi-4",
  "microsoft/Phi-4-mini-instruct",
  "microsoft/Phi-4-reasoning",
  "microsoft/Phi-4-mini-reasoning",
  "microsoft/Phi-4-multimodal-instruct",
  // Google Gemma
  "google/gemma-2-2b-it",
  "google/gemma-2-9b-it",
  "google/gemma-2-27b-it",
  "google/gemma-3-1b-it",
  "google/gemma-3-4b-it",
  "google/gemma-3-12b-it",
  "google/gemma-3-27b-it",
  "google/gemma-3n-E4B-it",
  "google/gemma-3n-E2B-it",
  "google/gemma-4-E2B-it",
  "google/gemma-4-E2B",
  "google/gemma-4-E4B-it",
  "google/gemma-4-E4B",
  "google/gemma-4-26B-A4B-it",
  "google/gemma-4-26B-A4B",
  "google/gemma-4-31B-it",
  "google/gemma-4-31B",
  // DeepSeek
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
  "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
  "deepseek-ai/DeepSeek-V3",
  "deepseek-ai/DeepSeek-R1",
  "deepseek-ai/DeepSeek-V3.2",
  // Cohere
  "CohereForAI/c4ai-command-r-v01",
  // Small / edge
  "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  "stabilityai/stablelm-2-1_6b-chat",
  // IBM Granite
  "ibm-granite/granite-3.1-8b-instruct",
  // NVIDIA
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
  "nvidia/NVIDIA-Nemotron-Nano-9B-v2",
  // HuggingFace
  "HuggingFaceTB/SmolLM3-3B",
  "HuggingFaceH4/zephyr-7b-beta",
  // Others
  "allenai/OLMo-2-0325-32B-Instruct",
  "THUDM/glm-4-9b-chat",
  "bigcode/starcoder2-7b",
  "bigcode/starcoder2-15b",
  "tiiuae/Falcon3-7B-Instruct",
  "tiiuae/Falcon3-10B-Instruct",
  "moonshotai/Kimi-K2-Instruct",
  "LGAI-EXAONE/EXAONE-4.0-32B",
  "LGAI-EXAONE/EXAONE-4.0-1.2B",
];

// ── Quantization ──────────────────────────────────────────

const QUANT_BPP: Record<string, number> = {
  F16: 2.0,
  Q8_0: 1.0,
  Q6_K: 0.75,
  Q5_K_M: 0.625,
  Q4_K_M: 0.5,
  Q3_K_M: 0.4375,
  Q2_K: 0.3125,
};

const QUANT_QUALITY: Record<string, string> = {
  F16: "lossless",
  Q8_0: "excellent",
  Q6_K: "excellent",
  Q5_K_M: "good",
  Q4_K_M: "good",
  Q3_K_M: "moderate",
  Q2_K: "low",
};

const RUNTIME_OVERHEAD = 1.2;

function estimateVRAM(totalParams: number, quant: string): number {
  const bpp = QUANT_BPP[quant] || 0.5;
  const modelSizeGB = (totalParams * bpp) / (1024 ** 3);
  return Math.round(Math.max(modelSizeGB * 1.1, 0.5) * 10) / 10;
}

function estimateRAM(totalParams: number, quant: string): { min: number; recommended: number } {
  const bpp = QUANT_BPP[quant] || 0.5;
  const modelSizeGB = (totalParams * bpp) / (1024 ** 3);
  return {
    min: Math.round(Math.max(modelSizeGB * RUNTIME_OVERHEAD, 1.0) * 10) / 10,
    recommended: Math.round(Math.max(modelSizeGB * 2.0, 2.0) * 10) / 10,
  };
}

// ── MoE detection ─────────────────────────────────────────

const MOE_ACTIVE_PARAMS: Record<string, number> = {
  "mistralai/Mixtral-8x7B-Instruct-v0.1": 12_900_000_000,
  "mistralai/Mixtral-8x22B-Instruct-v0.1": 39_100_000_000,
  "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct": 2_400_000_000,
  "deepseek-ai/DeepSeek-V3": 37_000_000_000,
  "deepseek-ai/DeepSeek-R1": 37_000_000_000,
  "deepseek-ai/DeepSeek-V3.2": 37_000_000_000,
  "Qwen/Qwen3-30B-A3B": 3_300_000_000,
  "Qwen/Qwen3-235B-A22B": 22_000_000_000,
  "Qwen/Qwen3-Coder-480B-A35B-Instruct": 35_000_000_000,
  "Qwen/Qwen3.5-35B-A3B": 3_000_000_000,
  "Qwen/Qwen3.5-122B-A10B-FP8": 10_000_000_000,
  "Qwen/Qwen3.5-397B-A17B": 17_000_000_000,
  "meta-llama/Llama-4-Scout-17B-16E-Instruct": 17_000_000_000,
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct": 17_000_000_000,
  "moonshotai/Kimi-K2-Instruct": 32_000_000_000,
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16": 3_000_000_000,
};

const MOE_ARCHITECTURES: Record<string, { numExperts: number; activeExperts: number }> = {
  mixtral: { numExperts: 8, activeExperts: 2 },
  deepseek_v2: { numExperts: 64, activeExperts: 6 },
  deepseek_v3: { numExperts: 256, activeExperts: 8 },
  qwen3_moe: { numExperts: 128, activeExperts: 8 },
  llama4: { numExperts: 16, activeExperts: 1 },
  nemotron3_nano: { numExperts: 128, activeExperts: 6 },
  qwen3_5_moe: { numExperts: 256, activeExperts: 8 },
};

interface MoEInfo {
  isMoE: boolean;
  numExperts?: number;
  activeExperts?: number;
  activeParameters?: number;
}

function detectMoE(repoId: string, config: any, architecture: string, totalParams: number): MoEInfo {
  let numExperts = config?.num_local_experts || config?.num_experts || null;
  let activeExperts = config?.num_experts_per_tok || null;

  const moeArch = MOE_ARCHITECTURES[architecture];
  if (moeArch) {
    numExperts = numExperts || moeArch.numExperts;
    activeExperts = activeExperts || moeArch.activeExperts;
  }

  if (numExperts && activeExperts) {
    const activeParams = MOE_ACTIVE_PARAMS[repoId] ||
      Math.round(totalParams * 0.05 + (totalParams * 0.95 / numExperts) * activeExperts);
    return { isMoE: true, numExperts, activeExperts, activeParameters: activeParams };
  }

  return { isMoE: false };
}

// ── Use case inference ────────────────────────────────────

function inferUseCase(repoId: string, pipelineTag?: string): string[] {
  const rid = repoId.toLowerCase();
  const tags: string[] = [];

  if (pipelineTag === "image-text-to-text" || rid.includes("vision") || rid.includes("-vl-") || rid.includes("multimodal")) {
    tags.push("vision");
  }
  if (rid.includes("coder") || rid.includes("starcoder") || rid.includes("code")) {
    tags.push("code");
  }
  if (rid.includes("r1") || rid.includes("reason")) {
    tags.push("reasoning");
  }
  if (rid.includes("embed") || rid.includes("bge")) {
    tags.push("embeddings");
  }
  if (rid.includes("instruct") || rid.includes("chat")) {
    tags.push("chat");
  }
  if (tags.length === 0) tags.push("general");

  return tags;
}

function inferDescription(repoId: string, pipelineTag?: string): string {
  const rid = repoId.toLowerCase();
  if (rid.includes("embed") || rid.includes("bge")) return "Text embeddings for RAG";
  if (rid.includes("coder") || rid.includes("starcoder") || rid.includes("code")) return "Code generation and completion";
  if (rid.includes("r1") || rid.includes("reason")) return "Advanced reasoning, chain-of-thought";
  if (pipelineTag === "image-text-to-text" || rid.includes("vision") || rid.includes("-vl-")) return "Multimodal vision and text";
  if (rid.includes("instruct") || rid.includes("chat")) return "Instruction following, chat";
  if (rid.includes("tiny") || rid.includes("small") || rid.includes("mini")) return "Lightweight, edge deployment";
  return "General purpose text generation";
}

// ── Provider mapping ──────────────────────────────────────

function extractProvider(repoId: string): string {
  const org = repoId.split("/")[0].toLowerCase();
  const map: Record<string, string> = {
    "meta-llama": "Meta",
    mistralai: "Mistral AI",
    qwen: "Alibaba",
    microsoft: "Microsoft",
    google: "Google",
    "deepseek-ai": "DeepSeek",
    bigcode: "BigCode",
    cohereforai: "Cohere",
    tinyllama: "Community",
    stabilityai: "Stability AI",
    "nomic-ai": "Nomic",
    baai: "BAAI",
    "01-ai": "01.ai",
    upstage: "Upstage",
    tiiuae: "TII Falcon",
    huggingfaceh4: "HuggingFace",
    huggingfacetb: "HuggingFace",
    openchat: "OpenChat",
    lmsys: "LMSYS",
    nousresearch: "NousResearch",
    wizardlmteam: "WizardLM",
    "ibm-granite": "IBM",
    nvidia: "NVIDIA",
    allenai: "Allen AI",
    thudm: "Zhipu AI",
    "xai-org": "xAI",
    moonshotai: "Moonshot",
    "lgai-exaone": "LG AI",
    "zai-org": "Zhipu AI",
  };
  return map[org] || org;
}

function formatParamCount(total: number): string {
  if (total >= 1_000_000_000) {
    const val = total / 1_000_000_000;
    return val === Math.floor(val) ? `${val}B` : `${val.toFixed(1)}B`;
  }
  if (total >= 1_000_000) return `${Math.round(total / 1_000_000)}M`;
  return `${Math.round(total / 1_000)}K`;
}

// ── Context length ────────────────────────────────────────

function inferContextLength(config: any): number {
  if (!config) return 4096;
  const keys = ["max_position_embeddings", "max_sequence_length", "seq_length", "n_positions"];
  for (const key of keys) {
    const val = config[key];
    if (typeof val === "number" && val > 0) return val;
  }
  if (config.text_config) {
    for (const key of keys) {
      const val = config.text_config[key];
      if (typeof val === "number" && val > 0) return val;
    }
  }
  return 4096;
}

// ── API fetchers ──────────────────────────────────────────

async function fetchJSON(url: string): Promise<any | null> {
  try {
    const resp = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(30000) });
    if (!resp.ok) {
      if (resp.status === 401 && !HF_TOKEN) {
        console.error(`  ⚠ HTTP 401 for ${url} — model is gated, set HF_TOKEN`);
      } else {
        console.error(`  ⚠ HTTP ${resp.status} for ${url}`);
      }
      return null;
    }
    return await resp.json();
  } catch (e: any) {
    console.error(`  ⚠ Error: ${e.message}`);
    return null;
  }
}

async function fetchModelInfo(repoId: string) {
  return fetchJSON(`${HF_API}/${repoId}`);
}

async function fetchConfigJSON(repoId: string) {
  return fetchJSON(`https://huggingface.co/${repoId}/resolve/main/config.json`);
}

// ── Model output type ─────────────────────────────────────

interface ScrapedModel {
  id: string;
  name: string;
  provider: string;
  family: string;
  params: string;
  paramsBillions: number;
  parametersRaw: number;
  architecture: "dense" | "moe";
  activeParams?: string;
  releaseDate: string | null;
  contextLength: number;
  useCase: string[];
  description: string;
  url: string;
  minRamGB: number;
  recommendedRamGB: number;
  quants: { name: string; bits: number; vramGB: number; quality: string }[];
  moe?: { numExperts: number; activeExperts: number; activeParameters: number };
  hfDownloads: number;
  hfLikes: number;
}

// ── Scrape a single model ─────────────────────────────────

async function scrapeModel(repoId: string): Promise<ScrapedModel | null> {
  const info = await fetchModelInfo(repoId);
  if (!info) return null;

  // Extract parameter count
  const safetensors = info.safetensors || {};
  let totalParams = safetensors.total;
  if (!totalParams) {
    const paramsByDtype = safetensors.parameters || {};
    const vals = Object.values(paramsByDtype) as number[];
    if (vals.length > 0) totalParams = Math.max(...vals);
  }
  if (!totalParams) {
    console.error(`  ⚠ No param count for ${repoId}`);
    return null;
  }

  const config = info.config || {};
  const pipelineTag = info.pipeline_tag;
  const modelType = config.model_type || "unknown";

  // Fetch full config for context length
  const fullConfig = await fetchConfigJSON(repoId);
  const contextLength = inferContextLength(fullConfig || config);

  const { min, recommended } = estimateRAM(totalParams, "Q4_K_M");

  // MoE detection
  const moeInfo = detectMoE(repoId, fullConfig, modelType, totalParams);

  // Build quants array
  const quants = Object.entries(QUANT_BPP).map(([name, _bpp]) => ({
    name,
    bits: name === "F16" ? 16 : name === "Q8_0" ? 8 : name === "Q6_K" ? 6 : name === "Q5_K_M" ? 5 : name === "Q4_K_M" ? 4 : name === "Q3_K_M" ? 3 : 2,
    vramGB: estimateVRAM(totalParams, name),
    quality: QUANT_QUALITY[name] || "good",
  }));

  // Sort quants by bits ascending (Q2_K first for card default = Q4_K_M)
  quants.sort((a, b) => a.bits - b.bits);

  const paramsBillions = totalParams / 1_000_000_000;
  const family = repoId.split("/")[0].replace("meta-llama", "Llama").replace("mistralai", "Mistral").replace("deepseek-ai", "DeepSeek");

  const model: ScrapedModel = {
    id: repoId.split("/")[1].toLowerCase(),
    name: repoId.split("/")[1].replace(/-/g, " ").replace(/Instruct|instruct|hf/g, "").replace(/\s+/g, " ").trim(),
    provider: extractProvider(repoId),
    family: extractProvider(repoId),
    params: formatParamCount(totalParams),
    paramsBillions: Math.round(paramsBillions * 10) / 10,
    parametersRaw: totalParams,
    architecture: moeInfo.isMoE ? "moe" : "dense",
    releaseDate: (info.createdAt || "").slice(0, 10) || null,
    contextLength,
    useCase: inferUseCase(repoId, pipelineTag),
    description: inferDescription(repoId, pipelineTag),
    url: `https://huggingface.co/${repoId}`,
    minRamGB: min,
    recommendedRamGB: recommended,
    quants,
    hfDownloads: info.downloads || 0,
    hfLikes: info.likes || 0,
  };

  if (moeInfo.isMoE) {
    model.activeParams = formatParamCount(moeInfo.activeParameters!) + " active";
    model.moe = {
      numExperts: moeInfo.numExperts!,
      activeExperts: moeInfo.activeExperts!,
      activeParameters: moeInfo.activeParameters!,
    };
  }

  return model;
}

// ── FALLBACKS for gated models ────────────────────────────

const FALLBACKS: ScrapedModel[] = [
  // These are pre-computed for models that require auth
  // They'll only be used if the API call fails
].filter(Boolean);

// ── Main ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const discover = args.includes("--discover");
  const limitIdx = args.indexOf("-n");
  const discoverLimit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 30 : 30;

  if (HF_TOKEN) {
    console.log(`🔑 Authenticated (${HF_TOKEN.slice(0, 4)}...${HF_TOKEN.slice(-4)})`);
  } else {
    console.log("ℹ  No HF_TOKEN set. Gated models will be skipped.");
    console.log("   Set HF_TOKEN env var to access gated models.\n");
  }

  console.log(`\nScraping ${TARGET_MODELS.length} models from HuggingFace...\n`);

  const results: ScrapedModel[] = [];
  const scraped = new Set<string>();

  for (let i = 0; i < TARGET_MODELS.length; i++) {
    const repoId = TARGET_MODELS[i];
    process.stdout.write(`[${i + 1}/${TARGET_MODELS.length}] ${repoId}...`);

    const model = await scrapeModel(repoId);
    if (model) {
      console.log(` ✓ ${model.params}, ${model.quants.find(q => q.name === "Q4_K_M")?.vramGB}GB VRAM, ctx ${model.contextLength}`);
      results.push(model);
      scraped.add(repoId);
    } else {
      console.log(" ✗");
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  // Auto-discover trending models
  if (discover) {
    console.log(`\nDiscovering top ${discoverLimit} trending models...`);
    try {
      const resp = await fetch(
        `${HF_API}?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=${discoverLimit * 3}`,
        { headers: authHeaders() }
      );
      const trending = (await resp.json()) as any[];
      const skipOrgs = new Set(["TheBloke", "unsloth", "mlx-community", "bartowski", "mradermacher"]);

      let added = 0;
      for (const m of trending) {
        if (added >= discoverLimit) break;
        const id = m.id;
        if (!id || scraped.has(id)) continue;
        const org = id.split("/")[0];
        if (skipOrgs.has(org)) continue;
        const tags = new Set(m.tags || []);
        if (tags.has("gguf") || tags.has("adapter") || tags.has("merge")) continue;
        if (!tags.has("safetensors")) continue;
        if ((m.downloads || 0) < 10000) continue;

        process.stdout.write(`[discover] ${id}...`);
        const model = await scrapeModel(id);
        if (model) {
          console.log(` ✓ ${model.params}`);
          results.push(model);
          scraped.add(id);
          added++;
        } else {
          console.log(" ✗");
        }
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e: any) {
      console.error(`  ⚠ Discovery failed: ${e.message}`);
    }
  }

  // Sort by param count
  results.sort((a, b) => a.parametersRaw - b.parametersRaw);

  // Write output
  const outputPath = new URL("../data/models.json", import.meta.url).pathname;
  await writeFile(outputPath, JSON.stringify(results, null, 2));

  console.log(`\n✅ Wrote ${results.length} models to data/models.json`);
  console.log(`\n${"Model".padEnd(50)} ${"Params".padStart(8)} ${"Q4 VRAM".padStart(8)} ${"Context".padStart(10)}`);
  console.log("─".repeat(78));
  for (const m of results) {
    const q4 = m.quants.find(q => q.name === "Q4_K_M");
    console.log(
      `${m.id.padEnd(50)} ${m.params.padStart(8)} ${(q4?.vramGB + "GB").padStart(8)} ${(m.contextLength >= 1024 ? Math.round(m.contextLength / 1024) + "K" : String(m.contextLength)).padStart(10)}`
    );
  }
}

main().catch(console.error);
