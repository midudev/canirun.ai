export interface Quantization {
  name: string;
  bits: number;
  vramGB: number;
  diskGB: number;
  quality: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  family: string;
  params: string;
  paramsBillions: number;
  activeParams?: string;
  architecture: "dense" | "moe";
  releaseDate: string | null;
  contextLength: number;
  /** chat/code/reasoning/vision (input) / image (generate) / video (generate) / edge / … */
  useCase: string[];
  description: string;
  url: string;
  /** Curated repository containing llama.cpp-compatible GGUF files. */
  ggufRepo?: string;
  minRamGB: number;
  recommendedRamGB: number;
  quants: Quantization[];
  moe?: { numExperts: number; activeExperts: number; activeParameters: number };
  hfDownloads?: number;
  hfLikes?: number;
  ollamaId?: string;
  lmStudioId?: string;
  featured?: boolean;
  tools?: boolean;
  thinking?: boolean;
  license?: string;
  /** Same product slot. Only the newest releaseDate in a lineage is recommendable. */
  lineage?: string;
}

export type LineageFields = Pick<
  AIModel,
  "id" | "lineage" | "releaseDate" | "paramsBillions"
>;

function parseLineageReleaseTs(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(`${value}-01`);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isNewerInLineage(candidate: LineageFields, current: LineageFields): boolean {
  const candidateTs = parseLineageReleaseTs(candidate.releaseDate);
  const currentTs = parseLineageReleaseTs(current.releaseDate);
  if (candidateTs !== currentTs) return candidateTs > currentTs;
  if (candidate.paramsBillions !== current.paramsBillions) {
    return candidate.paramsBillions > current.paramsBillions;
  }
  return candidate.id.localeCompare(current.id) > 0;
}

/** Newest model per lineage. Models without `lineage` are omitted. */
export function getLineageCurrent<T extends LineageFields>(
  catalog: readonly T[],
): Map<string, T> {
  const current = new Map<string, T>();
  for (const model of catalog) {
    if (!model.lineage) continue;
    const existing = current.get(model.lineage);
    if (!existing || isNewerInLineage(model, existing)) {
      current.set(model.lineage, model);
    }
  }
  return current;
}

/** `true` when the model has no lineage or is the newest in that slot. */
export function isCurrentInLineage<T extends LineageFields>(
  model: T,
  catalog: readonly T[],
): boolean {
  if (!model.lineage) return true;
  return getLineageCurrent(catalog).get(model.lineage)?.id === model.id;
}

/** The current model in this lineage, or `null` if `model` is already current. */
export function getLineageSuccessor<T extends LineageFields>(
  model: T,
  catalog: readonly T[],
): T | null {
  if (!model.lineage) return null;
  const current = getLineageCurrent(catalog).get(model.lineage);
  if (!current || current.id === model.id) return null;
  return current;
}

/** Parameters evaluated for each token. Dense models use all their weights. */
export function getActiveParamsBillions(
  model: Pick<AIModel, "paramsBillions" | "architecture" | "activeParams" | "moe">,
): number {
  if (model.architecture !== "moe") return model.paramsBillions;
  if (model.moe?.activeParameters) {
    return model.moe.activeParameters / 1_000_000_000;
  }
  const parsed = model.activeParams?.match(/([\d.]+)\s*B/i)?.[1];
  const active = parsed ? Number.parseFloat(parsed) : Number.NaN;
  return Number.isFinite(active) && active > 0 ? active : model.paramsBillions;
}

/** Approximate quantized working set used for MoE throughput estimates. */
export function getInferenceWorkingSetGB(
  totalVramGB: number,
  model: Pick<AIModel, "paramsBillions" | "architecture" | "activeParams" | "moe">,
): number {
  const activeParams = getActiveParamsBillions(model);
  if (model.paramsBillions <= 0 || activeParams >= model.paramsBillions) {
    return totalVramGB;
  }
  return Math.max(0.5, totalVramGB * (activeParams / model.paramsBillions));
}

// ── Helper to compute quants from param count ─────────────

// ~0.5 GB constant overhead for KV cache + inference runtime (llama.cpp, CUDA/Metal context)
const RUNTIME_OVERHEAD_GB = 0.5;

function makeQuants(paramsB: number): Quantization[] {
  const totalParams = paramsB * 1_000_000_000;
  const vram = (bpp: number) => Math.round(Math.max((totalParams * bpp) / (1024 ** 3) * 1.1 + RUNTIME_OVERHEAD_GB, 0.5) * 10) / 10;
  const disk = (bpp: number) => Math.round(Math.max((totalParams * bpp) / (1024 ** 3) * 1.05, 0.1) * 10) / 10;

  return [
    { name: "Q2_K", bits: 2, vramGB: vram(0.3125), diskGB: disk(0.3125), quality: "low" },
    { name: "Q3_K_M", bits: 3, vramGB: vram(0.4375), diskGB: disk(0.4375), quality: "moderate" },
    { name: "Q4_K_M", bits: 4, vramGB: vram(0.5), diskGB: disk(0.5), quality: "good" },
    { name: "Q5_K_M", bits: 5, vramGB: vram(0.625), diskGB: disk(0.625), quality: "good" },
    { name: "Q6_K", bits: 6, vramGB: vram(0.75), diskGB: disk(0.75), quality: "excellent" },
    { name: "Q8_0", bits: 8, vramGB: vram(1.0), diskGB: disk(1.0), quality: "excellent" },
    { name: "F16", bits: 16, vramGB: vram(2.0), diskGB: disk(2.0), quality: "lossless" },
  ];
}

function ram(paramsB: number): { min: number; rec: number } {
  const totalParams = paramsB * 1_000_000_000;
  const modelSizeGB = (totalParams * 0.5) / (1024 ** 3);
  return {
    min: Math.round(Math.max(modelSizeGB * 1.2, 1.0) * 10) / 10,
    rec: Math.round(Math.max(modelSizeGB * 2.0, 2.0) * 10) / 10,
  };
}

// ── Real GGUF file sizes from HuggingFace ─────────────────
// Run `pnpm exec tsx scripts/fetch-gguf-sizes.ts` to regenerate.
import ggufSizesData from "./gguf-sizes.json";
const ggufSizes: Record<string, Record<string, number>> = ggufSizesData;

function applyRealSizes(modelId: string, quants: Quantization[]): Quantization[] {
  const sizes = ggufSizes[modelId];
  if (!sizes) return quants;
  return quants
    .filter((q) => q.name in sizes)
    .map((q) => ({ ...q, diskGB: sizes[q.name] ?? q.diskGB }));
}

// ── Try to load scraped data ──────────────────────────────
let scrapedModels: AIModel[] | null = null;

// ── Static fallback model list ────────────────────────────

const STATIC_MODELS: AIModel[] = [
  // Tiny (<2B)
  { id: "qwen3.5-0.8b", name: "Qwen 3.5 0.8B", provider: "Alibaba", family: "Qwen", params: "0.8B", paramsBillions: 0.8, architecture: "dense", releaseDate: "2026-02", contextLength: 32768, useCase: ["chat", "edge"], description: "Ultra-tiny model for embedded and edge", url: "https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF", minRamGB: ram(0.8).min, recommendedRamGB: ram(0.8).rec, quants: makeQuants(0.8), ollamaId: "qwen3.5:0.8b", thinking: true, license: "Apache 2.0", lineage: "qwen-tiny" },
  { id: "qwen3-0.6b", name: "Qwen 3 0.6B", provider: "Alibaba", family: "Qwen", params: "0.6B", paramsBillions: 0.6, architecture: "dense", releaseDate: "2025-04", contextLength: 32768, useCase: ["chat", "edge"], description: "Ultra-light Qwen 3 model for constrained devices", url: "https://huggingface.co/lmstudio-community/Qwen3-0.6B-GGUF", minRamGB: ram(0.6).min, recommendedRamGB: ram(0.6).rec, quants: makeQuants(0.6), thinking: true, license: "Apache 2.0", lineage: "qwen-tiny" },
  { id: "llama3.2-1b", name: "Llama 3.2 1B", provider: "Meta", family: "Llama", params: "1B", paramsBillions: 1, architecture: "dense", releaseDate: "2024-09", contextLength: 131072, useCase: ["chat", "edge"], description: "Meta's smallest Llama for edge devices", url: "https://huggingface.co/meta-llama/Llama-3.2-1B", minRamGB: ram(1).min, recommendedRamGB: ram(1).rec, quants: makeQuants(1), ollamaId: "llama3.2:1b", tools: true, license: "Llama 3.2 Community" },
  { id: "gemma3-1b", name: "Gemma 3 1B", provider: "Google", family: "Gemma", params: "1B", paramsBillions: 1, architecture: "dense", releaseDate: "2025-03", contextLength: 32768, useCase: ["chat", "edge"], description: "Google's tiny Gemma for on-device", url: "https://huggingface.co/google/gemma-3-1b-it", minRamGB: ram(1).min, recommendedRamGB: ram(1).rec, quants: makeQuants(1), ollamaId: "gemma3:1b", lmStudioId: "gemma-3", license: "Gemma" },
  { id: "qwen2.5-coder-1.5b", name: "Qwen 2.5 Coder 1.5B", provider: "Alibaba", family: "Qwen", params: "1.5B", paramsBillions: 1.5, architecture: "dense", releaseDate: "2024-11", contextLength: 32768, useCase: ["code"], description: "Ultra-lightweight coding model", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct", minRamGB: ram(1.5).min, recommendedRamGB: ram(1.5).rec, quants: makeQuants(1.5), ollamaId: "qwen2.5-coder:1.5b", license: "Apache 2.0" },
  { id: "deepseek-r1-1.5b", name: "DeepSeek R1 1.5B", provider: "DeepSeek", family: "DeepSeek", params: "1.5B", paramsBillions: 1.5, architecture: "dense", releaseDate: "2025-01", contextLength: 65536, useCase: ["reasoning"], description: "Tiny reasoning model distilled from R1", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B", minRamGB: ram(1.5).min, recommendedRamGB: ram(1.5).rec, quants: makeQuants(1.5), ollamaId: "deepseek-r1:1.5b", lmStudioId: "deepseek-r1", thinking: true, license: "MIT" },
  { id: "qwen3-1.7b", name: "Qwen 3 1.7B", provider: "Alibaba", family: "Qwen", params: "1.7B", paramsBillions: 1.7, architecture: "dense", releaseDate: "2025-04", contextLength: 32768, useCase: ["chat", "multilingual"], description: "Compact multilingual Qwen 3", url: "https://huggingface.co/Qwen/Qwen3-1.7B", minRamGB: ram(1.7).min, recommendedRamGB: ram(1.7).rec, quants: makeQuants(1.7), ollamaId: "qwen3:1.7b", lmStudioId: "qwen3-2504", thinking: true, license: "Apache 2.0", lineage: "qwen-small-2b" },
  { id: "qwen3.5-2b", name: "Qwen 3.5 2B", provider: "Alibaba", family: "Qwen", params: "2B", paramsBillions: 2, architecture: "dense", releaseDate: "2026-02", contextLength: 32768, useCase: ["chat", "multilingual"], description: "Small multimodal Qwen 3.5", url: "https://huggingface.co/lmstudio-community/Qwen3.5-2B-GGUF", minRamGB: ram(2).min, recommendedRamGB: ram(2).rec, quants: makeQuants(2), ollamaId: "qwen3.5:2b", thinking: true, license: "Apache 2.0", lineage: "qwen-small-2b" },
  // Small (2-5B)
  { id: "llama3.2-3b", name: "Llama 3.2 3B", provider: "Meta", family: "Llama", params: "3B", paramsBillions: 3, architecture: "dense", releaseDate: "2024-09", contextLength: 131072, useCase: ["chat", "code"], description: "Lightweight Llama for mobile and edge", url: "https://huggingface.co/meta-llama/Llama-3.2-3B", minRamGB: ram(3).min, recommendedRamGB: ram(3).rec, quants: makeQuants(3), ollamaId: "llama3.2:3b", tools: true, license: "Llama 3.2 Community" },
  { id: "smollm3-3b", name: "SmolLM3 3B", provider: "HuggingFace", family: "SmolLM", params: "3B", paramsBillions: 3, architecture: "dense", releaseDate: "2025-07", contextLength: 131072, useCase: ["chat", "reasoning"], description: "Lightweight multilingual reasoning", url: "https://huggingface.co/HuggingFaceTB/SmolLM3-3B", minRamGB: ram(3).min, recommendedRamGB: ram(3).rec, quants: makeQuants(3), license: "Apache 2.0" },
  { id: "granite-4.1-3b", name: "Granite 4.1 3B", provider: "IBM", family: "Granite", params: "3B", paramsBillions: 3, architecture: "dense", releaseDate: "2026-04", contextLength: 131072, useCase: ["chat", "code", "rag", "multilingual"], description: "Compact enterprise model for edge and constrained environments", url: "https://huggingface.co/ibm-granite/granite-4.1-3b", minRamGB: ram(3).min, recommendedRamGB: ram(3).rec, quants: makeQuants(3), ollamaId: "ibm/granite4.1:3b", tools: true, license: "Apache 2.0" },
  { id: "phi-4-mini-reasoning", name: "Phi-4 Mini Reasoning", provider: "Microsoft", family: "Phi", params: "3.8B", paramsBillions: 3.8, architecture: "dense", releaseDate: "2025-04", contextLength: 16384, useCase: ["reasoning"], description: "Lightweight reasoning model", url: "https://huggingface.co/microsoft/Phi-4-mini-reasoning", minRamGB: ram(3.8).min, recommendedRamGB: ram(3.8).rec, quants: makeQuants(3.8), ollamaId: "phi4-mini-reasoning", lmStudioId: "phi-4-reasoning", thinking: true, license: "MIT" },
  { id: "gemma3-4b", name: "Gemma 3 4B", provider: "Google", family: "Gemma", params: "4B", paramsBillions: 4, architecture: "dense", releaseDate: "2025-03", contextLength: 131072, useCase: ["chat", "vision"], description: "Multimodal Gemma with 128K context", url: "https://huggingface.co/google/gemma-3-4b-it", minRamGB: ram(4).min, recommendedRamGB: ram(4).rec, quants: makeQuants(4), ollamaId: "gemma3:4b", lmStudioId: "gemma-3", license: "Gemma" },
  { id: "qwen3.5-4b", name: "Qwen 3.5 4B", provider: "Alibaba", family: "Qwen", params: "4B", paramsBillions: 4, architecture: "dense", releaseDate: "2026-02", contextLength: 32768, useCase: ["chat", "multilingual"], description: "Small multimodal Qwen 3.5", url: "https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF", minRamGB: ram(4).min, recommendedRamGB: ram(4).rec, quants: makeQuants(4), ollamaId: "qwen3.5:4b", thinking: true, license: "Apache 2.0" },
  { id: "gemma4-e2b-it", name: "Gemma 4 E2B IT", provider: "Google", family: "Gemma", params: "5B", paramsBillions: 5, architecture: "dense", releaseDate: "2026-04", contextLength: 262144, useCase: ["chat", "vision"], description: "Gemma 4 efficient instruct model (official)", url: "https://huggingface.co/google/gemma-4-E2B-it", ggufRepo: "unsloth/gemma-4-E2B-it-GGUF", minRamGB: ram(5).min, recommendedRamGB: ram(5).rec, quants: makeQuants(5), license: "Gemma" },
  { id: "gemma4-e4b-it", name: "Gemma 4 E4B IT", provider: "Google", family: "Gemma", params: "8B", paramsBillions: 8, architecture: "dense", releaseDate: "2026-04", contextLength: 262144, useCase: ["chat", "vision"], description: "Gemma 4 balanced instruct model (official)", url: "https://huggingface.co/google/gemma-4-E4B-it", ggufRepo: "unsloth/gemma-4-E4B-it-GGUF", minRamGB: ram(8).min, recommendedRamGB: ram(8).rec, quants: makeQuants(8), license: "Gemma" },
  // Medium (5-10B)
  { id: "qwen2.5-coder-7b", name: "Qwen 2.5 Coder 7B", provider: "Alibaba", family: "Qwen", params: "7B", paramsBillions: 7, architecture: "dense", releaseDate: "2024-11", contextLength: 131072, useCase: ["code"], description: "Dedicated coding model", url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct", minRamGB: ram(7).min, recommendedRamGB: ram(7).rec, quants: makeQuants(7), ollamaId: "qwen2.5-coder:7b", tools: true, license: "Apache 2.0" },
  { id: "deepseek-r1-7b", name: "DeepSeek R1 Distill 7B", provider: "DeepSeek", family: "DeepSeek", params: "7B", paramsBillions: 7, architecture: "dense", releaseDate: "2025-01", contextLength: 65536, useCase: ["reasoning"], description: "R1 reasoning distilled into Qwen 7B", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", minRamGB: ram(7).min, recommendedRamGB: ram(7).rec, quants: makeQuants(7), ollamaId: "deepseek-r1:7b", lmStudioId: "deepseek-r1", thinking: true, license: "MIT" },
  { id: "llama3.1-8b", name: "Llama 3.1 8B", provider: "Meta", family: "Llama", params: "8B", paramsBillions: 8, architecture: "dense", releaseDate: "2024-07", contextLength: 131072, useCase: ["chat", "code", "reasoning"], description: "Meta's versatile 8B — great quality/speed ratio", url: "https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct", minRamGB: ram(8).min, recommendedRamGB: ram(8).rec, quants: makeQuants(8), ollamaId: "llama3.1:8b", tools: true, license: "Llama 3.1 Community" },
  { id: "qwen3-8b", name: "Qwen 3 8B", provider: "Alibaba", family: "Qwen", params: "8B", paramsBillions: 8, architecture: "dense", releaseDate: "2025-04", contextLength: 131072, useCase: ["chat", "code", "reasoning"], description: "Qwen 3 with thinking mode support", url: "https://huggingface.co/Qwen/Qwen3-8B", minRamGB: ram(8).min, recommendedRamGB: ram(8).rec, quants: makeQuants(8), ollamaId: "qwen3:8b", lmStudioId: "qwen3-2504", tools: true, thinking: true, license: "Apache 2.0" },
  { id: "granite-4.1-8b", name: "Granite 4.1 8B", provider: "IBM", family: "Granite", params: "8B", paramsBillions: 8, architecture: "dense", releaseDate: "2026-04", contextLength: 131072, useCase: ["chat", "code", "rag", "multilingual"], description: "Balanced general-purpose enterprise model", url: "https://huggingface.co/ibm-granite/granite-4.1-8b", minRamGB: ram(8).min, recommendedRamGB: ram(8).rec, quants: makeQuants(8), ollamaId: "ibm/granite4.1:8b", tools: true, license: "Apache 2.0" },
  { id: "ministral-8b", name: "Ministral 8B", provider: "Mistral AI", family: "Mistral", params: "8B", paramsBillions: 8, architecture: "dense", releaseDate: "2024-10", contextLength: 32768, useCase: ["chat"], description: "Mistral's efficient 8B model", url: "https://huggingface.co/mistralai/Ministral-8B-Instruct-2410", minRamGB: ram(8).min, recommendedRamGB: ram(8).rec, quants: makeQuants(8), ollamaId: "ministral-3:8b", lmStudioId: "ministral", tools: true, license: "MRL" },
  { id: "glm-4-9b", name: "GLM-4 9B", provider: "Zhipu AI", family: "GLM", params: "9B", paramsBillions: 9, architecture: "dense", releaseDate: "2024-06", contextLength: 131072, useCase: ["chat", "multilingual", "code"], description: "Multilingual model supporting 26 languages with 128K context", url: "https://huggingface.co/THUDM/glm-4-9b-chat", minRamGB: ram(9).min, recommendedRamGB: ram(9).rec, quants: makeQuants(9), ollamaId: "glm4:9b", tools: true, license: "GLM-4" },
  { id: "nemotron-nano-9b", name: "Nemotron Nano 9B v2", provider: "NVIDIA", family: "Nemotron", params: "9B", paramsBillions: 9, architecture: "dense", releaseDate: "2025-06", contextLength: 131072, useCase: ["reasoning"], description: "Hybrid Mamba2 architecture for reasoning", url: "https://huggingface.co/nvidia/NVIDIA-Nemotron-Nano-9B-v2", minRamGB: ram(9).min, recommendedRamGB: ram(9).rec, quants: makeQuants(9), thinking: true, license: "NVIDIA Open" },
  { id: "qwen3.5-9b", name: "Qwen 3.5 9B", provider: "Alibaba", family: "Qwen", params: "9B", paramsBillions: 9, architecture: "dense", releaseDate: "2026-02", contextLength: 32768, useCase: ["chat", "vision"], description: "Multimodal Qwen 3.5 mid-size", url: "https://huggingface.co/lmstudio-community/Qwen3.5-9B-GGUF", minRamGB: ram(9).min, recommendedRamGB: ram(9).rec, quants: makeQuants(9), ollamaId: "qwen3.5:9b", featured: true, thinking: true, license: "Apache 2.0" },
  { id: "ornith-1.0-9b", name: "Ornith 1.0 9B", provider: "DeepReinforce", family: "Ornith", params: "9B", paramsBillions: 9, architecture: "dense", releaseDate: "2026-06", contextLength: 262144, useCase: ["code", "reasoning"], description: "Self-improving agentic coding model optimized for terminal and software engineering tasks", url: "https://huggingface.co/deepreinforce-ai/Ornith-1.0-9B", minRamGB: ram(9).min, recommendedRamGB: ram(9).rec, quants: makeQuants(9), ollamaId: "ornith:9b", tools: true, thinking: true, license: "MIT" },
  // Large (10-30B)
  { id: "gemma3-12b", name: "Gemma 3 12B", provider: "Google", family: "Gemma", params: "12B", paramsBillions: 12, architecture: "dense", releaseDate: "2025-03", contextLength: 131072, useCase: ["chat", "vision", "reasoning"], description: "Multimodal Gemma with 128K context", url: "https://huggingface.co/google/gemma-3-12b-it", minRamGB: ram(12).min, recommendedRamGB: ram(12).rec, quants: makeQuants(12), ollamaId: "gemma3:12b", lmStudioId: "gemma-3", license: "Gemma" },
  { id: "mistral-nemo-12b", name: "Mistral Nemo 12B", provider: "Mistral AI", family: "Mistral", params: "12B", paramsBillions: 12, architecture: "dense", releaseDate: "2024-07", contextLength: 131072, useCase: ["chat", "multilingual"], description: "Multilingual 12B with 128K context", url: "https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407", minRamGB: ram(12).min, recommendedRamGB: ram(12).rec, quants: makeQuants(12), ollamaId: "mistral-nemo", lmStudioId: "mistral-nemo", tools: true, license: "Apache 2.0" },
  { id: "phi-4-14b", name: "Phi-4 14B", provider: "Microsoft", family: "Phi", params: "14B", paramsBillions: 14, architecture: "dense", releaseDate: "2024-12", contextLength: 16384, useCase: ["reasoning", "code"], description: "Microsoft's reasoning-focused model", url: "https://huggingface.co/microsoft/phi-4", minRamGB: ram(14).min, recommendedRamGB: ram(14).rec, quants: makeQuants(14), ollamaId: "phi4", lmStudioId: "phi-4", tools: true, license: "MIT" },
  { id: "qwen3-14b", name: "Qwen 3 14B", provider: "Alibaba", family: "Qwen", params: "14B", paramsBillions: 14, architecture: "dense", releaseDate: "2025-04", contextLength: 131072, useCase: ["chat", "code", "reasoning"], description: "Strong all-rounder with thinking mode", url: "https://huggingface.co/Qwen/Qwen3-14B", minRamGB: ram(14).min, recommendedRamGB: ram(14).rec, quants: makeQuants(14), ollamaId: "qwen3:14b", lmStudioId: "qwen3-2504", tools: true, thinking: true, license: "Apache 2.0" },
  { id: "deepseek-r1-14b", name: "DeepSeek R1 Distill 14B", provider: "DeepSeek", family: "DeepSeek", params: "14B", paramsBillions: 14, architecture: "dense", releaseDate: "2025-01", contextLength: 65536, useCase: ["reasoning"], description: "R1 reasoning distilled into Qwen 14B", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B", minRamGB: ram(14).min, recommendedRamGB: ram(14).rec, quants: makeQuants(14), ollamaId: "deepseek-r1:14b", lmStudioId: "deepseek-r1", thinking: true, license: "MIT" },
  { id: "llama4-scout-17b", name: "Llama 4 Scout 17B", provider: "Meta", family: "Llama", params: "109B", paramsBillions: 109, activeParams: "17B active", architecture: "moe", releaseDate: "2025-04", contextLength: 131072, useCase: ["chat", "vision", "reasoning"], description: "MoE with 16 experts, 17B active params", url: "https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct", minRamGB: ram(109).min, recommendedRamGB: ram(109).rec, quants: makeQuants(109), moe: { numExperts: 16, activeExperts: 1, activeParameters: 17_000_000_000 }, ollamaId: "llama4:scout", tools: true, featured: true, license: "Llama 4 Community" },
  { id: "gpt-oss-20b", name: "GPT-OSS 20B", provider: "OpenAI", family: "GPT-OSS", params: "21B", paramsBillions: 21, activeParams: "3.6B active", architecture: "moe", releaseDate: "2025-08", contextLength: 131072, useCase: ["chat", "reasoning", "code"], description: "OpenAI's open-weight MoE with configurable reasoning", url: "https://huggingface.co/openai/gpt-oss-20b", minRamGB: ram(21).min, recommendedRamGB: ram(21).rec, quants: makeQuants(21), moe: { numExperts: 16, activeExperts: 2, activeParameters: 3_600_000_000 }, tools: true, ollamaId: "gpt-oss:20b", lmStudioId: "gpt-oss", featured: true, license: "Apache 2.0" },
  { id: "lfm2-24b", name: "LFM2 24B", provider: "Liquid AI", family: "LFM", params: "24B", paramsBillions: 24, activeParams: "2.3B active", architecture: "moe", releaseDate: "2025-11", contextLength: 32768, useCase: ["chat", "edge", "rag"], description: "Hybrid MoE with convolution+attention layers — 2.3B active", url: "https://huggingface.co/LiquidAI/LFM2-24B-A2B", minRamGB: ram(24).min, recommendedRamGB: ram(24).rec, quants: makeQuants(24), moe: { numExperts: 64, activeExperts: 4, activeParameters: 2_300_000_000 }, ollamaId: "lfm2:24b", lmStudioId: "lfm2-24b-a2b", license: "Liquid AI" },
  { id: "devstral-small-2-24b", name: "Devstral Small 2 24B", provider: "Mistral AI", family: "Mistral", params: "24B", paramsBillions: 24, architecture: "dense", releaseDate: "2025-12", contextLength: 262144, useCase: ["code"], description: "Coding-focused model with 256K context — 68% SWE-bench", url: "https://huggingface.co/mistralai/Devstral-Small-2-24B-Instruct-2512", minRamGB: ram(24).min, recommendedRamGB: ram(24).rec, quants: makeQuants(24), ollamaId: "devstral-small-2", lmStudioId: "devstral", license: "Apache 2.0" },
  { id: "mistral-small-24b", name: "Mistral Small 3.1 24B", provider: "Mistral AI", family: "Mistral", params: "24B", paramsBillions: 24, architecture: "dense", releaseDate: "2025-03", contextLength: 131072, useCase: ["chat", "vision", "code"], description: "Multimodal Mistral with vision support", url: "https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503", minRamGB: ram(24).min, recommendedRamGB: ram(24).rec, quants: makeQuants(24), ollamaId: "mistral-small", lmStudioId: "mistral-small", tools: true, license: "Apache 2.0" },
  { id: "gemma4-26b-a4b-it", name: "Gemma 4 26B-A4B IT", provider: "Google", family: "Gemma", params: "27B", paramsBillions: 27, activeParams: "4B active", architecture: "moe", releaseDate: "2026-04", contextLength: 262144, useCase: ["chat", "vision", "reasoning"], description: "Gemma 4 MoE instruct model (official)", url: "https://huggingface.co/google/gemma-4-26B-A4B-it", ggufRepo: "unsloth/gemma-4-26B-A4B-it-GGUF", minRamGB: ram(27).min, recommendedRamGB: ram(27).rec, quants: makeQuants(27), moe: { numExperts: 26, activeExperts: 4, activeParameters: 4_000_000_000 }, featured: true, license: "Gemma" },
  { id: "diffusiongemma-26b-a4b-it", name: "DiffusionGemma 26B-A4B IT", provider: "Google", family: "Gemma", params: "26B", paramsBillions: 26, activeParams: "4B active", architecture: "moe", releaseDate: "2026-06", contextLength: 262144, useCase: ["chat", "vision", "reasoning"], description: "Discrete diffusion MoE — 1100+ tok/s on H100, multimodal (text/image/video)", url: "https://huggingface.co/google/diffusiongemma-26B-A4B-it", minRamGB: ram(26).min, recommendedRamGB: ram(26).rec, quants: makeQuants(26), moe: { numExperts: 128, activeExperts: 8, activeParameters: 3_800_000_000 }, tools: true, thinking: true, license: "Apache 2.0" },
  { id: "qwen3.5-27b", name: "Qwen 3.5 27B", provider: "Alibaba", family: "Qwen", params: "27.8B", paramsBillions: 27.8, architecture: "dense", releaseDate: "2026-02", contextLength: 262144, useCase: ["chat", "vision", "reasoning"], description: "Flagship native multimodal Qwen 3.5", url: "https://huggingface.co/lmstudio-community/Qwen3.5-27B-GGUF", minRamGB: ram(27.8).min, recommendedRamGB: ram(27.8).rec, quants: makeQuants(27.8), ollamaId: "qwen3.5:27b", thinking: true, license: "Apache 2.0" },
  // XL (30-80B)
  { id: "gemma4-31b-it", name: "Gemma 4 31B IT", provider: "Google", family: "Gemma", params: "33B", paramsBillions: 33, architecture: "dense", releaseDate: "2026-04", contextLength: 262144, useCase: ["chat", "vision", "reasoning"], description: "Gemma 4 flagship instruct model (official)", url: "https://huggingface.co/google/gemma-4-31B-it", ggufRepo: "unsloth/gemma-4-31B-it-GGUF", minRamGB: ram(33).min, recommendedRamGB: ram(33).rec, quants: makeQuants(33), license: "Gemma" },
  { id: "gemma4-31b", name: "Gemma 4 31B", provider: "Google", family: "Gemma", params: "33B", paramsBillions: 33, architecture: "dense", releaseDate: "2026-04", contextLength: 262144, useCase: ["vision", "reasoning"], description: "Gemma 4 flagship base model (official)", url: "https://huggingface.co/google/gemma-4-31B", minRamGB: ram(33).min, recommendedRamGB: ram(33).rec, quants: makeQuants(33), license: "Gemma" },
  { id: "qwen3-30b-a3b", name: "Qwen 3 30B-A3B", provider: "Alibaba", family: "Qwen", params: "30B", paramsBillions: 30, activeParams: "3.3B active", architecture: "moe", releaseDate: "2025-04", contextLength: 131072, useCase: ["chat", "reasoning"], description: "MoE with only 3.3B active — extremely efficient", url: "https://huggingface.co/Qwen/Qwen3-30B-A3B", minRamGB: ram(30).min, recommendedRamGB: ram(30).rec, quants: makeQuants(30), moe: { numExperts: 128, activeExperts: 8, activeParameters: 3_300_000_000 }, tools: true, thinking: true, ollamaId: "qwen3:30b-a3b", lmStudioId: "qwen3-2504", license: "Apache 2.0", lineage: "qwen-moe-mid" },
  { id: "agents-a1", name: "Agents-A1 35B-A3B", provider: "InternScience", family: "Agents-A1", params: "35B", paramsBillions: 35, activeParams: "3B active", architecture: "moe", releaseDate: "2026-06", contextLength: 262144, useCase: ["chat", "vision", "reasoning", "code"], description: "Efficient multimodal agentic MoE for long-horizon search, engineering and scientific research", url: "https://huggingface.co/InternScience/Agents-A1", minRamGB: ram(35).min, recommendedRamGB: ram(35).rec, quants: makeQuants(35), tools: true, thinking: true, featured: true, license: "Apache 2.0" },
  { id: "nemotron-nano-30b", name: "Nemotron 3 Nano 30B", provider: "NVIDIA", family: "Nemotron", params: "30B", paramsBillions: 30, activeParams: "3B active", architecture: "moe", releaseDate: "2025-06", contextLength: 1048576, useCase: ["chat", "reasoning"], description: "MoE with 1M context and 3B active", url: "https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16", minRamGB: ram(30).min, recommendedRamGB: ram(30).rec, quants: makeQuants(30), moe: { numExperts: 128, activeExperts: 6, activeParameters: 3_000_000_000 }, ollamaId: "nemotron-3-nano:30b", lmStudioId: "nemotron-3", thinking: true, license: "NVIDIA Open" },
  { id: "granite-4.1-30b", name: "Granite 4.1 30B", provider: "IBM", family: "Granite", params: "30B", paramsBillions: 30, architecture: "dense", releaseDate: "2026-04", contextLength: 131072, useCase: ["chat", "code", "rag", "multilingual", "reasoning"], description: "High-capacity enterprise model for complex reasoning and tool use", url: "https://huggingface.co/ibm-granite/granite-4.1-30b", minRamGB: ram(30).min, recommendedRamGB: ram(30).rec, quants: makeQuants(30), ollamaId: "ibm/granite4.1:30b", tools: true, license: "Apache 2.0" },
  { id: "north-mini-code-1.0", name: "North Mini Code", provider: "Cohere", family: "North", params: "30B", paramsBillions: 30, activeParams: "3B active", architecture: "moe", releaseDate: "2026-06", contextLength: 262144, useCase: ["code", "reasoning"], description: "Open agentic coding MoE with 3B active — built for software engineering and terminal tasks", url: "https://huggingface.co/CohereLabs/North-Mini-Code-1.0", minRamGB: ram(30).min, recommendedRamGB: ram(30).rec, quants: makeQuants(30), moe: { numExperts: 128, activeExperts: 8, activeParameters: 3_000_000_000 }, ollamaId: "north-mini-code-1.0", tools: true, thinking: true, license: "Apache 2.0" },
  { id: "qwen3-32b", name: "Qwen 3 32B", provider: "Alibaba", family: "Qwen", params: "32B", paramsBillions: 32, architecture: "dense", releaseDate: "2025-04", contextLength: 131072, useCase: ["chat", "code", "reasoning"], description: "Qwen 3 flagship dense model", url: "https://huggingface.co/Qwen/Qwen3-32B", minRamGB: ram(32).min, recommendedRamGB: ram(32).rec, quants: makeQuants(32), ollamaId: "qwen3:32b", lmStudioId: "qwen3-2504", tools: true, thinking: true, license: "Apache 2.0" },
  { id: "deepseek-r1-32b", name: "DeepSeek R1 Distill 32B", provider: "DeepSeek", family: "DeepSeek", params: "32B", paramsBillions: 32, architecture: "dense", releaseDate: "2025-01", contextLength: 65536, useCase: ["reasoning"], description: "R1 reasoning distilled into Qwen 32B — sweet spot", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", minRamGB: ram(32).min, recommendedRamGB: ram(32).rec, quants: makeQuants(32), ollamaId: "deepseek-r1:32b", lmStudioId: "deepseek-r1", thinking: true, license: "MIT" },
  { id: "olmo2-32b", name: "OLMo 2 32B", provider: "Allen AI", family: "OLMo", params: "32B", paramsBillions: 32, architecture: "dense", releaseDate: "2025-03", contextLength: 4096, useCase: ["chat", "reasoning"], description: "Fully open research model by Allen AI", url: "https://huggingface.co/allenai/OLMo-2-0325-32B-Instruct", minRamGB: ram(32).min, recommendedRamGB: ram(32).rec, quants: makeQuants(32), license: "Apache 2.0" },
  { id: "command-r-35b", name: "Command R 35B", provider: "Cohere", family: "Command", params: "35B", paramsBillions: 35, architecture: "dense", releaseDate: "2024-03", contextLength: 131072, useCase: ["chat", "rag"], description: "Optimized for retrieval-augmented generation", url: "https://huggingface.co/CohereForAI/c4ai-command-r-v01", minRamGB: ram(35).min, recommendedRamGB: ram(35).rec, quants: makeQuants(35), ollamaId: "command-r:35b", tools: true, license: "CC BY-NC 4.0" },
  { id: "qwen3.5-35b-a3b", name: "Qwen 3.5 35B-A3B", provider: "Alibaba", family: "Qwen", params: "35B", paramsBillions: 35, activeParams: "3B active", architecture: "moe", releaseDate: "2026-02", contextLength: 262144, useCase: ["chat", "vision"], description: "Efficient multimodal MoE with 3B active", url: "https://huggingface.co/lmstudio-community/Qwen3.5-35B-A3B-GGUF", minRamGB: ram(35).min, recommendedRamGB: ram(35).rec, quants: makeQuants(35), moe: { numExperts: 256, activeExperts: 8, activeParameters: 3_000_000_000 }, ollamaId: "qwen3.5:35b-a3b", thinking: true, license: "Apache 2.0" },
  { id: "ornith-1.0-35b", name: "Ornith 1.0 35B-A3B", provider: "DeepReinforce", family: "Ornith", params: "35B", paramsBillions: 35, activeParams: "3B active", architecture: "moe", releaseDate: "2026-06", contextLength: 262144, useCase: ["code", "reasoning"], description: "Agentic coding MoE with a 3B active working set and self-improving training", url: "https://huggingface.co/deepreinforce-ai/Ornith-1.0-35B", minRamGB: ram(35).min, recommendedRamGB: ram(35).rec, quants: makeQuants(35), moe: { numExperts: 256, activeExperts: 8, activeParameters: 3_000_000_000 }, ollamaId: "ornith:35b", tools: true, thinking: true, featured: true, license: "MIT" },
  { id: "mixtral-8x7b", name: "Mixtral 8x7B", provider: "Mistral AI", family: "Mistral", params: "47B", paramsBillions: 47, activeParams: "12.9B active", architecture: "moe", releaseDate: "2023-12", contextLength: 32768, useCase: ["chat", "code"], description: "MoE with 12.9B active params", url: "https://huggingface.co/mistralai/Mixtral-8x7B-Instruct-v0.1", minRamGB: ram(47).min, recommendedRamGB: ram(47).rec, quants: makeQuants(47), moe: { numExperts: 8, activeExperts: 2, activeParameters: 12_900_000_000 }, tools: true, ollamaId: "mixtral:8x7b", license: "Apache 2.0" },
  { id: "qwen3-next-80b-a3b", name: "Qwen 3 Next 80B-A3B", provider: "Alibaba", family: "Qwen", params: "80B", paramsBillions: 80, activeParams: "3B active", architecture: "moe", releaseDate: "2025-12", contextLength: 262144, useCase: ["chat", "reasoning", "code"], description: "High-sparsity MoE — extreme low activation ratio for fast inference at 80B scale", url: "https://huggingface.co/Qwen/Qwen3-Next-80B-A3B-Instruct", minRamGB: ram(80).min, recommendedRamGB: ram(80).rec, quants: makeQuants(80), moe: { numExperts: 512, activeExperts: 10, activeParameters: 3_000_000_000 }, ollamaId: "qwen3-next:80b", tools: true, thinking: true, license: "Apache 2.0" },
  { id: "qwen3-coder-next-80b-a3b", name: "Qwen 3 Coder Next 80B-A3B", provider: "Alibaba", family: "Qwen", params: "80B", paramsBillions: 80, activeParams: "3B active", architecture: "moe", releaseDate: "2026-02", contextLength: 262144, useCase: ["code"], description: "Ultra-efficient agentic coding MoE optimized for tool-calling coding agents", url: "https://huggingface.co/Qwen/Qwen3-Coder-Next", minRamGB: ram(80).min, recommendedRamGB: ram(80).rec, quants: makeQuants(80), moe: { numExperts: 512, activeExperts: 10, activeParameters: 3_000_000_000 }, ollamaId: "qwen3-coder-next", tools: true, license: "Apache 2.0" },
  // XXL (70B+)
  { id: "llama3.3-70b", name: "Llama 3.3 70B", provider: "Meta", family: "Llama", params: "70B", paramsBillions: 70, architecture: "dense", releaseDate: "2024-12", contextLength: 131072, useCase: ["chat", "reasoning", "code"], description: "Best open model at 70B class", url: "https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct", minRamGB: ram(70).min, recommendedRamGB: ram(70).rec, quants: makeQuants(70), ollamaId: "llama3.3:70b", tools: true, license: "Llama 3.3 Community" },
  { id: "gpt-oss-120b", name: "GPT-OSS 120B", provider: "OpenAI", family: "GPT-OSS", params: "117B", paramsBillions: 117, activeParams: "5.1B active", architecture: "moe", releaseDate: "2025-08", contextLength: 131072, useCase: ["chat", "reasoning", "code"], description: "OpenAI's flagship open-weight MoE — 52.6% SWE-bench", url: "https://huggingface.co/openai/gpt-oss-120b", minRamGB: ram(117).min, recommendedRamGB: ram(117).rec, quants: makeQuants(117), moe: { numExperts: 16, activeExperts: 2, activeParameters: 5_100_000_000 }, tools: true, ollamaId: "gpt-oss:120b", lmStudioId: "gpt-oss", featured: true, license: "Apache 2.0" },
  { id: "qwen3.5-122b-a10b", name: "Qwen 3.5 122B-A10B", provider: "Alibaba", family: "Qwen", params: "122B", paramsBillions: 122, activeParams: "10B active", architecture: "moe", releaseDate: "2026-02", contextLength: 262144, useCase: ["chat", "vision", "reasoning"], description: "Large multimodal MoE", url: "https://huggingface.co/lmstudio-community/Qwen3.5-122B-A10B-GGUF", minRamGB: ram(122).min, recommendedRamGB: ram(122).rec, quants: makeQuants(122), moe: { numExperts: 256, activeExperts: 8, activeParameters: 10_000_000_000 }, ollamaId: "qwen3.5:122b-a10b", thinking: true, license: "Apache 2.0" },
  { id: "llama4-maverick-17b-128e", name: "Llama 4 Maverick 17B-128E", provider: "Meta", family: "Llama", params: "400B", paramsBillions: 400, activeParams: "17B active", architecture: "moe", releaseDate: "2025-04", contextLength: 1048576, useCase: ["chat", "vision", "reasoning", "code"], description: "Multimodal MoE with 128 experts — 17B active, 1M context", url: "https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct", minRamGB: ram(400).min, recommendedRamGB: ram(400).rec, quants: makeQuants(400), moe: { numExperts: 128, activeExperts: 1, activeParameters: 17_000_000_000 }, tools: true, ollamaId: "llama4:maverick", license: "Llama 4 Community" },
  { id: "qwen3-235b-a22b", name: "Qwen 3 235B-A22B", provider: "Alibaba", family: "Qwen", params: "235B", paramsBillions: 235, activeParams: "22B active", architecture: "moe", releaseDate: "2025-04", contextLength: 131072, useCase: ["chat", "code", "reasoning"], description: "Massive MoE with 22B active — frontier quality", url: "https://huggingface.co/Qwen/Qwen3-235B-A22B", minRamGB: ram(235).min, recommendedRamGB: ram(235).rec, quants: makeQuants(235), moe: { numExperts: 128, activeExperts: 8, activeParameters: 22_000_000_000 }, ollamaId: "qwen3:235b-a22b", lmStudioId: "qwen3-2504", tools: true, thinking: true, license: "Apache 2.0" },
  { id: "qwen3-vl-235b-a22b", name: "Qwen 3 VL 235B-A22B", provider: "Alibaba", family: "Qwen", params: "235B", paramsBillions: 235, activeParams: "22B active", architecture: "moe", releaseDate: "2025-11", contextLength: 262144, useCase: ["chat", "vision", "reasoning", "code"], description: "Flagship vision-language MoE — frontier multimodal reasoning and agentic GUI control", url: "https://huggingface.co/Qwen/Qwen3-VL-235B-A22B-Instruct", minRamGB: ram(235).min, recommendedRamGB: ram(235).rec, quants: makeQuants(235), moe: { numExperts: 128, activeExperts: 8, activeParameters: 22_000_000_000 }, ollamaId: "qwen3-vl:235b-a22b", featured: true, tools: true, thinking: true, license: "Apache 2.0" },
  { id: "qwen3.5-397b-a17b", name: "Qwen 3.5 397B-A17B", provider: "Alibaba", family: "Qwen", params: "397B", paramsBillions: 397, activeParams: "17B active", architecture: "moe", releaseDate: "2026-02", contextLength: 262144, useCase: ["chat", "vision", "reasoning", "code"], description: "Largest multimodal Qwen 3.5 MoE", url: "https://huggingface.co/Qwen/Qwen3.5-397B-A17B", minRamGB: ram(397).min, recommendedRamGB: ram(397).rec, quants: makeQuants(397), moe: { numExperts: 256, activeExperts: 8, activeParameters: 17_000_000_000 }, ollamaId: "qwen3.5:397b-cloud", thinking: true, license: "Apache 2.0" },
  { id: "qwen3-coder-480b", name: "Qwen 3 Coder 480B", provider: "Alibaba", family: "Qwen", params: "480B", paramsBillions: 480, activeParams: "35B active", architecture: "moe", releaseDate: "2025-07", contextLength: 262144, useCase: ["code"], description: "Largest open coding MoE — 35B active", url: "https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct", minRamGB: ram(480).min, recommendedRamGB: ram(480).rec, quants: makeQuants(480), moe: { numExperts: 128, activeExperts: 8, activeParameters: 35_000_000_000 }, ollamaId: "qwen3-coder:480b", lmStudioId: "qwen3-coder", thinking: true, license: "Apache 2.0" },
  { id: "hy3", name: "Hy3", provider: "Tencent", family: "Hunyuan", params: "295B", paramsBillions: 295, activeParams: "21B active", architecture: "moe", releaseDate: "2026-07", contextLength: 262144, useCase: ["chat", "reasoning", "code"], description: "Production-focused agentic MoE with strong coding, tool use and long-context reasoning", url: "https://huggingface.co/tencent/Hy3", minRamGB: ram(295).min, recommendedRamGB: ram(295).rec, quants: makeQuants(295), moe: { numExperts: 192, activeExperts: 8, activeParameters: 21_000_000_000 }, tools: true, thinking: true, featured: true, license: "Apache 2.0" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek", family: "DeepSeek", params: "671B", paramsBillions: 671, activeParams: "37B active", architecture: "moe", releaseDate: "2025-01", contextLength: 65536, useCase: ["reasoning"], description: "Massive MoE reasoning model — 37B active", url: "https://huggingface.co/deepseek-ai/DeepSeek-R1", minRamGB: ram(671).min, recommendedRamGB: ram(671).rec, quants: makeQuants(671), moe: { numExperts: 256, activeExperts: 8, activeParameters: 37_000_000_000 }, thinking: true, ollamaId: "deepseek-r1:671b", lmStudioId: "deepseek-r1", license: "MIT" },
  { id: "deepseek-v3.2", name: "DeepSeek V3.2", provider: "DeepSeek", family: "DeepSeek", params: "685B", paramsBillions: 685, activeParams: "37B active", architecture: "moe", releaseDate: "2025-12", contextLength: 131072, useCase: ["chat", "code", "reasoning"], description: "State-of-the-art MoE — 37B active params", url: "https://huggingface.co/deepseek-ai/DeepSeek-V3.2", minRamGB: ram(685).min, recommendedRamGB: ram(685).rec, quants: makeQuants(685), moe: { numExperts: 256, activeExperts: 8, activeParameters: 37_000_000_000 }, ollamaId: "deepseek-v3.2", tools: true, license: "MIT" },
  { id: "qwen3-coder-30b", name: "Qwen 3 Coder 30B-A3B", provider: "Alibaba", family: "Qwen", params: "30B", paramsBillions: 30, activeParams: "3B active", architecture: "moe", releaseDate: "2025-07", contextLength: 262144, useCase: ["code"], description: "Efficient agentic coding MoE — 3B active, 256K context", url: "https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct", minRamGB: ram(30).min, recommendedRamGB: ram(30).rec, quants: makeQuants(30), moe: { numExperts: 128, activeExperts: 8, activeParameters: 3_000_000_000 }, ollamaId: "qwen3-coder:30b", lmStudioId: "qwen3-coder", tools: true, license: "Apache 2.0", lineage: "qwen-dense-27b" },
  { id: "qwen3.6-27b", name: "Qwen 3.6 27B", provider: "Alibaba", family: "Qwen", params: "27.8B", paramsBillions: 27.8, architecture: "dense", releaseDate: "2026-04", contextLength: 262144, useCase: ["chat", "vision", "reasoning", "code"], description: "Flagship dense Qwen 3.6 — native multimodal all-rounder", url: "https://huggingface.co/Qwen/Qwen3.6-27B", ggufRepo: "unsloth/Qwen3.6-27B-GGUF", minRamGB: ram(27.8).min, recommendedRamGB: ram(27.8).rec, quants: makeQuants(27.8), ollamaId: "qwen3.6:27b", tools: true, thinking: true, license: "Apache 2.0", lineage: "qwen-dense-27b" },
  { id: "qwen3.6-35b-a3b", name: "Qwen 3.6 35B-A3B", provider: "Alibaba", family: "Qwen", params: "36B", paramsBillions: 36, activeParams: "3B active", architecture: "moe", releaseDate: "2026-04", contextLength: 262144, useCase: ["chat", "vision", "reasoning", "code"], description: "Big-model quality at 3B-active speed — the mid-hardware sweet spot", url: "https://huggingface.co/Qwen/Qwen3.6-35B-A3B", ggufRepo: "unsloth/Qwen3.6-35B-A3B-GGUF", minRamGB: ram(36).min, recommendedRamGB: ram(36).rec, quants: makeQuants(36), moe: { numExperts: 256, activeExperts: 8, activeParameters: 3_000_000_000 }, ollamaId: "qwen3.6:35b-a3b", tools: true, thinking: true, featured: true, license: "Apache 2.0", lineage: "qwen-moe-mid" },
  { id: "glm-4.5-air", name: "GLM-4.5 Air", provider: "Z.ai", family: "GLM", params: "106B", paramsBillions: 106, activeParams: "12B active", architecture: "moe", releaseDate: "2025-07", contextLength: 131072, useCase: ["chat", "reasoning", "code"], description: "Consumer-friendly GLM MoE — 12B active, strong agentic & tool use", url: "https://huggingface.co/zai-org/GLM-4.5-Air", minRamGB: ram(106).min, recommendedRamGB: ram(106).rec, quants: makeQuants(106), moe: { numExperts: 128, activeExperts: 8, activeParameters: 12_000_000_000 }, tools: true, thinking: true, license: "MIT" },
  { id: "glm-4.6", name: "GLM-4.6", provider: "Z.ai", family: "GLM", params: "357B", paramsBillions: 357, activeParams: "32B active", architecture: "moe", releaseDate: "2025-09", contextLength: 200000, useCase: ["chat", "code", "reasoning"], description: "Large GLM MoE with strong coding and 200K context", url: "https://huggingface.co/zai-org/GLM-4.6", minRamGB: ram(357).min, recommendedRamGB: ram(357).rec, quants: makeQuants(357), moe: { numExperts: 160, activeExperts: 8, activeParameters: 32_000_000_000 }, tools: true, ollamaId: "glm-4.6", license: "MIT" },
  { id: "glm-5", name: "GLM-5", provider: "Zhipu AI", family: "GLM", params: "744B", paramsBillions: 744, activeParams: "40B active", architecture: "moe", releaseDate: "2026-02", contextLength: 131072, useCase: ["chat", "reasoning", "code"], description: "MoE with 256 experts, 40B active — frontier-class agentic coding", url: "https://huggingface.co/zai-org/GLM-5", minRamGB: ram(744).min, recommendedRamGB: ram(744).rec, quants: makeQuants(744), moe: { numExperts: 256, activeExperts: 8, activeParameters: 40_000_000_000 }, tools: true, thinking: true, license: "MIT", lineage: "glm-frontier" },
  { id: "glm-5.1", name: "GLM-5.1", provider: "Zhipu AI", family: "GLM", params: "754B", paramsBillions: 754, activeParams: "40B active", architecture: "moe", releaseDate: "2026-04", contextLength: 131072, useCase: ["chat", "reasoning", "code"], description: "Improved agentic coding — SOTA SWE-bench Pro, long-horizon tasks", url: "https://huggingface.co/zai-org/GLM-5.1", minRamGB: ram(754).min, recommendedRamGB: ram(754).rec, quants: makeQuants(754), moe: { numExperts: 256, activeExperts: 8, activeParameters: 40_000_000_000 }, tools: true, thinking: true, license: "MIT", lineage: "glm-frontier" },
  { id: "glm-5.2", name: "GLM-5.2", provider: "Z.ai", family: "GLM", params: "753B", paramsBillions: 753, activeParams: "40B active", architecture: "moe", releaseDate: "2026-06", contextLength: 1048576, useCase: ["chat", "code", "reasoning"], description: "Frontier open-weight coder — top SWE-bench, 1M context", url: "https://huggingface.co/zai-org/GLM-5.2", minRamGB: ram(753).min, recommendedRamGB: ram(753).rec, quants: makeQuants(753), moe: { numExperts: 256, activeExperts: 8, activeParameters: 40_000_000_000 }, tools: true, thinking: true, ollamaId: "glm-5.2", license: "MIT", lineage: "glm-frontier" },
  { id: "glm-5.3", name: "GLM-5.3", provider: "Z.ai", family: "GLM", params: "753B", paramsBillions: 753, activeParams: "40B active", architecture: "moe", releaseDate: "2026-08", contextLength: 1048576, useCase: ["chat", "code", "reasoning"], description: "Same 753B / 40B-active base as GLM-5.2 — post-training lifts coding and long-horizon agents, 1M context", url: "https://huggingface.co/zai-org/GLM-5.3", minRamGB: ram(753).min, recommendedRamGB: ram(753).rec, quants: makeQuants(753), moe: { numExperts: 256, activeExperts: 8, activeParameters: 40_000_000_000 }, tools: true, thinking: true, featured: true, license: "MIT", lineage: "glm-frontier" },
  { id: "longcat-2.0", name: "LongCat 2.0", provider: "Meituan", family: "LongCat", params: "1.6T", paramsBillions: 1600, activeParams: "48B active", architecture: "moe", releaseDate: "2026-07", contextLength: 1048576, useCase: ["chat", "code", "reasoning"], description: "Frontier-scale agentic and coding MoE with sparse attention and native 1M context", url: "https://huggingface.co/meituan-longcat/LongCat-2.0", minRamGB: ram(1600).min, recommendedRamGB: ram(1600).rec, quants: makeQuants(1600), tools: true, thinking: true, featured: true, license: "MIT" },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek", family: "DeepSeek", params: "158B", paramsBillions: 158, activeParams: "13B active", architecture: "moe", releaseDate: "2026-04", contextLength: 1048576, useCase: ["chat", "code", "reasoning"], description: "Efficient long-context V4 — 13B active, 1M context", url: "https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash", minRamGB: ram(158).min, recommendedRamGB: ram(158).rec, quants: makeQuants(158), moe: { numExperts: 256, activeExperts: 6, activeParameters: 13_000_000_000 }, tools: true, license: "MIT" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "DeepSeek", family: "DeepSeek", params: "1.6T", paramsBillions: 1600, activeParams: "49B active", architecture: "moe", releaseDate: "2026-04", contextLength: 1048576, useCase: ["chat", "code", "reasoning"], description: "Flagship V4 MoE — 49B active, 1M context", url: "https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro", minRamGB: ram(1600).min, recommendedRamGB: ram(1600).rec, quants: makeQuants(1600), moe: { numExperts: 384, activeExperts: 6, activeParameters: 49_000_000_000 }, tools: true, thinking: true, featured: true, license: "MIT" },
  { id: "kimi-k2.6", name: "Kimi K2.6", provider: "Moonshot AI", family: "Kimi", params: "1.06T", paramsBillions: 1058, activeParams: "32B active", architecture: "moe", releaseDate: "2026-04", contextLength: 262144, useCase: ["chat", "vision", "reasoning", "code"], description: "Natively multimodal 1T MoE — 32B active, frontier agentic", url: "https://huggingface.co/moonshotai/Kimi-K2.6", ggufRepo: "unsloth/Kimi-K2.6-GGUF", minRamGB: ram(1058).min, recommendedRamGB: ram(1058).rec, quants: makeQuants(1058), moe: { numExperts: 384, activeExperts: 8, activeParameters: 32_000_000_000 }, tools: true, ollamaId: "kimi-k2.6", license: "Kimi", lineage: "kimi-frontier" },
  { id: "kimi-k3", name: "Kimi K3", provider: "Moonshot AI", family: "Kimi", params: "2.8T", paramsBillions: 2780, activeParams: "104B active", architecture: "moe", releaseDate: "2026-07", contextLength: 1048576, useCase: ["chat", "vision", "reasoning", "code"], description: "Frontier 2.8T multimodal MoE — 104B active, native video understanding, 1M context", url: "https://huggingface.co/moonshotai/Kimi-K3", ggufRepo: "unsloth/Kimi-K3-GGUF", minRamGB: ram(2780).min, recommendedRamGB: ram(2780).rec, quants: makeQuants(2780), moe: { numExperts: 896, activeExperts: 16, activeParameters: 104_200_000_000 }, tools: true, thinking: true, featured: true, license: "Kimi", lineage: "kimi-frontier" },
  { id: "qwen3.8-27b", name: "Qwen 3.8 27B", provider: "Alibaba", family: "Qwen", params: "27B", paramsBillions: 27, architecture: "dense", releaseDate: "2026-08", contextLength: 262144, useCase: ["chat", "vision", "reasoning", "code"], description: "Flagship dense Qwen 3.8 — native multimodal all-rounder with video understanding", url: "https://huggingface.co/Qwen/Qwen3.8-27B", ggufRepo: "unsloth/Qwen3.8-27B-GGUF", minRamGB: ram(27).min, recommendedRamGB: ram(27).rec, quants: makeQuants(27), ollamaId: "qwen3.8:27b", tools: true, thinking: true, featured: true, license: "Apache 2.0", lineage: "qwen-dense-27b" },
  { id: "muse-glimmer-30b", name: "Muse Glimmer 30B", provider: "Meta", family: "Muse", params: "30B", paramsBillions: 30, architecture: "dense", releaseDate: "2026-08", contextLength: 131072, useCase: ["chat", "vision", "reasoning", "code"], description: "Open agentic 30B distilled from Muse Spark — tool use, vision and local recovery on a single GPU", url: "https://huggingface.co/meta-models/Muse-Glimmer-30B", ggufRepo: "unsloth/Muse-Glimmer-30B-GGUF", minRamGB: ram(30).min, recommendedRamGB: ram(30).rec, quants: makeQuants(30), ollamaId: "muse-glimmer", lmStudioId: "muse-glimmer", tools: true, thinking: true, featured: true, license: "Apache 2.0" },
  { id: "qwen3.8-2.4t-a95b", name: "Qwen 3.8 2.4T-A95B", provider: "Alibaba", family: "Qwen", params: "2.4T", paramsBillions: 2400, activeParams: "95B active", architecture: "moe", releaseDate: "2026-08", contextLength: 1048576, useCase: ["chat", "reasoning", "code"], description: "Frontier Qwen 3.8 MoE — 95B active, 1M context", url: "https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B", ggufRepo: "unsloth/Qwen3.8-2.4T-A95B-GGUF", minRamGB: ram(2400).min, recommendedRamGB: ram(2400).rec, quants: makeQuants(2400), tools: true, thinking: true, featured: true, license: "Qwen" },
  { id: "minimax-m3", name: "MiniMax M3", provider: "MiniMax", family: "MiniMax", params: "428B", paramsBillions: 428, activeParams: "23B active", architecture: "moe", releaseDate: "2026-06", contextLength: 1048576, useCase: ["chat", "vision", "reasoning", "code"], description: "Native multimodal MoE — understands text, image and long video with 1M context", url: "https://huggingface.co/MiniMaxAI/MiniMax-M3", ggufRepo: "unsloth/MiniMax-M3-GGUF", minRamGB: ram(428).min, recommendedRamGB: ram(428).rec, quants: makeQuants(428), moe: { numExperts: 128, activeExperts: 4, activeParameters: 23_000_000_000 }, tools: true, thinking: true, featured: true, license: "MiniMax Community" },
  { id: "minimax-h3", name: "MiniMax H3", provider: "MiniMax", family: "MiniMax", params: "33B", paramsBillions: 33, architecture: "dense", releaseDate: "2026-08", contextLength: 32768, useCase: ["video"], description: "Open video generation — text/image to 2K video with native stereo audio", url: "https://huggingface.co/MiniMaxAI/MiniMax-H3", ggufRepo: "unsloth/MiniMax-H3-GGUF", minRamGB: ram(33).min, recommendedRamGB: ram(33).rec, quants: makeQuants(33), featured: true, license: "MiniMax Community" },
  { id: "wan2.1-t2v-1.3b", name: "Wan 2.1 T2V 1.3B", provider: "Alibaba", family: "Wan", params: "1.3B", paramsBillions: 1.3, architecture: "dense", releaseDate: "2025-02", contextLength: 4096, useCase: ["video"], description: "Tiny open text-to-video — 480p clips on 8GB consumer GPUs", url: "https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B", minRamGB: ram(1.3).min, recommendedRamGB: ram(1.3).rec, quants: makeQuants(1.3), license: "Apache 2.0" },
  { id: "wan2.2-ti2v-5b", name: "Wan 2.2 TI2V 5B", provider: "Alibaba", family: "Wan", params: "5B", paramsBillions: 5, architecture: "dense", releaseDate: "2025-07", contextLength: 4096, useCase: ["video"], description: "Unified text/image-to-video — the local sweet spot under Apache 2.0", url: "https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B", ggufRepo: "unsloth/Wan2.2-TI2V-5B-GGUF", minRamGB: ram(5).min, recommendedRamGB: ram(5).rec, quants: makeQuants(5), featured: true, license: "Apache 2.0" },
  { id: "hunyuan-video-1.5", name: "HunyuanVideo 1.5", provider: "Tencent", family: "Hunyuan", params: "8.3B", paramsBillions: 8.3, architecture: "dense", releaseDate: "2025-11", contextLength: 4096, useCase: ["video"], description: "Compact cinematic video model — strong faces and motion on a single 4090", url: "https://huggingface.co/tencent/HunyuanVideo-1.5", minRamGB: ram(8.3).min, recommendedRamGB: ram(8.3).rec, quants: makeQuants(8.3), featured: true, license: "Tencent Hunyuan Community" },
  { id: "wan2.2-t2v-a14b", name: "Wan 2.2 T2V A14B", provider: "Alibaba", family: "Wan", params: "27B", paramsBillions: 27, activeParams: "14B active", architecture: "moe", releaseDate: "2025-07", contextLength: 4096, useCase: ["video"], description: "Flagship open Wan 2.2 — 14B-active MoE for photoreal text-to-video", url: "https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B", minRamGB: ram(27).min, recommendedRamGB: ram(27).rec, quants: makeQuants(27), moe: { numExperts: 2, activeExperts: 1, activeParameters: 14_000_000_000 }, featured: true, license: "Apache 2.0" },
  { id: "ltx-2.3", name: "LTX 2.3", provider: "Lightricks", family: "LTX", params: "19B", paramsBillions: 19, architecture: "dense", releaseDate: "2026-03", contextLength: 4096, useCase: ["video"], description: "Open 4K video with native stereo audio — text, image and video-to-video", url: "https://huggingface.co/Lightricks/LTX-2.3", ggufRepo: "unsloth/LTX-2.3-GGUF", minRamGB: ram(19).min, recommendedRamGB: ram(19).rec, quants: makeQuants(19), featured: true, license: "LTX-2 Community" },
  // Image generation
  { id: "flux2-klein-4b", name: "FLUX.2 Klein 4B", provider: "Black Forest Labs", family: "FLUX.2", params: "4B", paramsBillions: 4, architecture: "dense", releaseDate: "2026-01", contextLength: 32768, useCase: ["image"], description: "Fastest open FLUX.2 — sub-second text-to-image and multi-reference editing on consumer GPUs", url: "https://huggingface.co/black-forest-labs/FLUX.2-klein-4B", ggufRepo: "unsloth/FLUX.2-klein-4B-GGUF", minRamGB: ram(4).min, recommendedRamGB: ram(4).rec, quants: makeQuants(4), featured: true, license: "Apache 2.0" },
  { id: "z-image-turbo", name: "Z-Image Turbo", provider: "Alibaba", family: "Z-Image", params: "6B", paramsBillions: 6, architecture: "dense", releaseDate: "2025-11", contextLength: 4096, useCase: ["image"], description: "8-step distilled image model — photorealism and bilingual text on 16GB cards", url: "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo", ggufRepo: "unsloth/Z-Image-Turbo-GGUF", minRamGB: ram(6).min, recommendedRamGB: ram(6).rec, quants: makeQuants(6), featured: true, license: "Apache 2.0" },
  { id: "flux2-klein-9b", name: "FLUX.2 Klein 9B", provider: "Black Forest Labs", family: "FLUX.2", params: "9B", paramsBillions: 9, architecture: "dense", releaseDate: "2026-01", contextLength: 32768, useCase: ["image"], description: "Higher-quality distilled FLUX.2 — sub-second generation and multi-reference editing", url: "https://huggingface.co/black-forest-labs/FLUX.2-klein-9B", ggufRepo: "unsloth/FLUX.2-klein-9B-GGUF", minRamGB: ram(9).min, recommendedRamGB: ram(9).rec, quants: makeQuants(9), license: "FLUX Non-Commercial" },
  { id: "qwen-image-2512", name: "Qwen Image 2512", provider: "Alibaba", family: "Qwen", params: "20B", paramsBillions: 20, architecture: "dense", releaseDate: "2025-12", contextLength: 4096, useCase: ["image"], description: "Open text-to-image with strong English and Chinese typography", url: "https://huggingface.co/Qwen/Qwen-Image-2512", ggufRepo: "unsloth/Qwen-Image-2512-GGUF", minRamGB: ram(20).min, recommendedRamGB: ram(20).rec, quants: makeQuants(20), featured: true, license: "Apache 2.0" },
  { id: "flux2-dev", name: "FLUX.2 Dev", provider: "Black Forest Labs", family: "FLUX.2", params: "32B", paramsBillions: 32, architecture: "dense", releaseDate: "2025-11", contextLength: 32768, useCase: ["image"], description: "Flagship open-weight FLUX.2 — text-to-image and multi-reference editing up to 4MP", url: "https://huggingface.co/black-forest-labs/FLUX.2-dev", ggufRepo: "unsloth/FLUX.2-dev-GGUF", minRamGB: ram(32).min, recommendedRamGB: ram(32).rec, quants: makeQuants(32), featured: true, license: "FLUX Non-Commercial" },
  { id: "hunyuan-image-3", name: "HunyuanImage 3.0", provider: "Tencent", family: "Hunyuan", params: "80B", paramsBillions: 80, activeParams: "13B active", architecture: "moe", releaseDate: "2025-09", contextLength: 4096, useCase: ["image"], description: "Largest open image MoE — 13B active, strong long-prompt generation", url: "https://huggingface.co/tencent/HunyuanImage-3.0", minRamGB: ram(80).min, recommendedRamGB: ram(80).rec, quants: makeQuants(80), moe: { numExperts: 64, activeExperts: 8, activeParameters: 13_000_000_000 }, license: "Tencent Hunyuan Community" },
  { id: "hunyuan-image-3-instruct", name: "HunyuanImage 3.0 Instruct", provider: "Tencent", family: "Hunyuan", params: "80B", paramsBillions: 80, activeParams: "13B active", architecture: "moe", releaseDate: "2026-01", contextLength: 4096, useCase: ["image"], description: "Reasoning image model — prompt rewrite, chain-of-thought and image-to-image editing", url: "https://huggingface.co/tencent/HunyuanImage-3.0-Instruct", minRamGB: ram(80).min, recommendedRamGB: ram(80).rec, quants: makeQuants(80), moe: { numExperts: 64, activeExperts: 8, activeParameters: 13_000_000_000 }, thinking: true, featured: true, license: "Tencent Hunyuan Community" },
  { id: "gemma4-12b-it", name: "Gemma 4 12B IT", provider: "Google", family: "Gemma", params: "12B", paramsBillions: 12, architecture: "dense", releaseDate: "2026-04", contextLength: 262144, useCase: ["chat", "vision", "reasoning"], description: "Gemma 4 mid-size instruct — multimodal any-to-any", url: "https://huggingface.co/google/gemma-4-12B-it", ggufRepo: "unsloth/gemma-4-12b-it-GGUF", minRamGB: ram(12).min, recommendedRamGB: ram(12).rec, quants: makeQuants(12), license: "Apache 2.0" },
  { id: "mistral-small-4-119b", name: "Mistral Small 4 119B", provider: "Mistral AI", family: "Mistral", params: "119B", paramsBillions: 119, activeParams: "6.5B active", architecture: "moe", releaseDate: "2026-03", contextLength: 262144, useCase: ["chat", "vision", "code", "reasoning"], description: "Sparse Mistral Small 4 — 6.5B active, strong local all-rounder", url: "https://huggingface.co/mistralai/Mistral-Small-4-119B-2603", ggufRepo: "unsloth/Mistral-Small-4-119B-2603-GGUF", minRamGB: ram(119).min, recommendedRamGB: ram(119).rec, quants: makeQuants(119), moe: { numExperts: 128, activeExperts: 4, activeParameters: 6_500_000_000 }, tools: true, featured: true, license: "Apache 2.0" },
  { id: "ministral-3-3b", name: "Ministral 3 3B", provider: "Mistral AI", family: "Mistral", params: "3B", paramsBillions: 3, architecture: "dense", releaseDate: "2025-12", contextLength: 262144, useCase: ["chat", "edge"], description: "Current-gen tiny Ministral — edge chat with 256K context", url: "https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512", minRamGB: ram(3).min, recommendedRamGB: ram(3).rec, quants: makeQuants(3), tools: true, license: "Apache 2.0" },
  { id: "ministral-3-14b", name: "Ministral 3 14B", provider: "Mistral AI", family: "Mistral", params: "14B", paramsBillions: 14, architecture: "dense", releaseDate: "2025-12", contextLength: 262144, useCase: ["chat", "code", "reasoning"], description: "Current-gen Ministral mid-size — local assistant with 256K context", url: "https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512", minRamGB: ram(14).min, recommendedRamGB: ram(14).rec, quants: makeQuants(14), tools: true, license: "Apache 2.0" },
  { id: "qwen3-vl-4b", name: "Qwen3-VL 4B", provider: "Alibaba", family: "Qwen", params: "4.4B", paramsBillions: 4.4, architecture: "dense", releaseDate: "2025-10", contextLength: 262144, useCase: ["chat", "vision"], description: "Compact dedicated vision-language model — OCR & image chat on edge", url: "https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct", minRamGB: ram(4.4).min, recommendedRamGB: ram(4.4).rec, quants: makeQuants(4.4), ollamaId: "qwen3-vl:4b", lmStudioId: "qwen3-vl", tools: true, license: "Apache 2.0" },
  { id: "qwen3-vl-8b", name: "Qwen3-VL 8B", provider: "Alibaba", family: "Qwen", params: "8.8B", paramsBillions: 8.8, architecture: "dense", releaseDate: "2025-10", contextLength: 262144, useCase: ["chat", "vision"], description: "The community-favourite local VLM — superb OCR, receipts & captioning", url: "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct", minRamGB: ram(8.8).min, recommendedRamGB: ram(8.8).rec, quants: makeQuants(8.8), ollamaId: "qwen3-vl:8b", lmStudioId: "qwen3-vl", tools: true, featured: true, license: "Apache 2.0" },
  { id: "qwen3-vl-30b-a3b", name: "Qwen3-VL 30B-A3B", provider: "Alibaba", family: "Qwen", params: "31B", paramsBillions: 31, activeParams: "3B active", architecture: "moe", releaseDate: "2025-09", contextLength: 262144, useCase: ["chat", "vision"], description: "Efficient vision MoE — 3B active, strong temporal & document understanding", url: "https://huggingface.co/Qwen/Qwen3-VL-30B-A3B-Instruct", minRamGB: ram(31).min, recommendedRamGB: ram(31).rec, quants: makeQuants(31), moe: { numExperts: 128, activeExperts: 8, activeParameters: 3_000_000_000 }, ollamaId: "qwen3-vl:30b-a3b", lmStudioId: "qwen3-vl", tools: true, featured: true, license: "Apache 2.0" },
];

// ── License helpers ────────────────────────────────────────

const COMMERCIAL_LICENSES = new Set([
  "Apache 2.0", "MIT", "CC BY 4.0", "Gemma", "NVIDIA Open",
  "Llama 3.1 Community", "Llama 3.2 Community", "Llama 3.3 Community", "Llama 4 Community",
  "LTX-2 Community",
]);

export function isCommercialLicense(license?: string): boolean {
  if (!license) return false;
  return COMMERCIAL_LICENSES.has(license);
}

export type LicenseTier = "open" | "partial" | "restricted";

const OPEN_LICENSES = new Set(["Apache 2.0", "MIT", "CC BY 4.0"]);
const PARTIAL_LICENSES = new Set([
  "Gemma", "NVIDIA Open",
  "Llama 3.1 Community", "Llama 3.2 Community", "Llama 3.3 Community", "Llama 4 Community",
  "LTX-2 Community",
]);

export function getLicenseTier(license?: string): LicenseTier {
  if (!license) return "restricted";
  if (OPEN_LICENSES.has(license)) return "open";
  if (PARTIAL_LICENSES.has(license)) return "partial";
  return "restricted";
}

export const LICENSE_LIST = [...new Set(
  STATIC_MODELS.map(m => m.license).filter(Boolean) as string[]
)].sort();

// ── Export ─────────────────────────────────────────────────

const CURATED_GGUF_REPOS: Record<string, string> = {
  "qwen2.5-coder-1.5b": "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF",
  "qwen2.5-coder-7b": "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
  "qwen2.5-coder-32b": "Qwen/Qwen2.5-Coder-32B-Instruct-GGUF",
  "qwen3-1.7b": "Qwen/Qwen3-1.7B-GGUF",
  "qwen3-4b": "Qwen/Qwen3-4B-GGUF",
  "qwen3-8b": "Qwen/Qwen3-8B-GGUF",
  "qwen3-14b": "Qwen/Qwen3-14B-GGUF",
  "qwen3-30b-a3b": "Qwen/Qwen3-30B-A3B-GGUF",
  "qwen3-32b": "Qwen/Qwen3-32B-GGUF",
};

const withRealSizes = (scrapedModels || STATIC_MODELS).map((m) => {
  const patched = applyRealSizes(m.id, m.quants);
  const ggufRepo = m.ggufRepo ?? CURATED_GGUF_REPOS[m.id];
  const model = ggufRepo ? { ...m, ggufRepo } : m;
  return patched.length > 0 ? { ...model, quants: patched } : model;
});

export const models: AIModel[] = withRealSizes;
