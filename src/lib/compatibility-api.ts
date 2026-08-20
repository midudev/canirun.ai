// ── Public compatibility API core ─────────────────────────
//
// Server-side, browser-free logic shared by the /api/* endpoints. It maps a
// friendly hardware description (as documented for external integrators) onto
// the internal `HardwareInfo` shape and runs the same compatibility engine used
// by the web UI.

import {
  getActiveParamsBillions,
  getLineageSuccessor,
  isCurrentInLineage,
  models,
  type AIModel,
  type Quantization,
} from "../data/models";
import {
  type HardwareInfo,
  type ModelStatus,
  evaluateModelComplete,
  matchGPU,
  matchApple,
  isAppleSiliconCheck,
} from "./hardware";
import { getAaBenchmark } from "../data/aa-benchmarks";

// ── Input shapes ───────────────────────────────────────────

export interface HardwareInput {
  cpu?: { name?: string; cores?: number; threads?: number } | null;
  ramGb?: number | null;
  ram?: number | null; // alias for ramGb
  gpu?: {
    name?: string | null;
    vramGb?: number | null;
    memoryBandwidthGbps?: number | null;
  } | null;
  // Advanced overrides for callers who know their platform
  appleSilicon?: boolean | null;
  mobile?: boolean | null;
  platform?: string | null;
}

export type ApiStatus =
  | "comfortable"
  | "tight"
  | "cpu-offload"
  | "insufficient"
  | "unknown";

// ── Helpers ────────────────────────────────────────────────

const round1 = (n: number): number => Math.round(n * 10) / 10;

function toPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const STATUS_MAP: Record<ModelStatus, ApiStatus> = {
  "can-run": "comfortable",
  "tight": "tight",
  "can-run-slow": "cpu-offload",
  "cannot-run": "insufficient",
  "unknown": "unknown",
};

// ── Hardware resolution ────────────────────────────────────

export interface ResolvedHardware {
  hw: HardwareInfo;
  detected: {
    kind: "apple-silicon" | "gpu" | "cpu";
    device: string | null;
    vramGb: number | null;
    ramGb: number | null;
    memoryBandwidthGbps: number | null;
  };
}

function baseHardware(input: HardwareInput, partial: Partial<HardwareInfo>): HardwareInfo {
  const name = input.gpu?.name?.trim() || null;
  return {
    gpuRenderer: name,
    gpuVendor: null,
    gpuCores: null,
    ramGB: null,
    estimatedVRAM: null,
    memoryBandwidth: null,
    systemRAM: null,
    deviceMemoryRaw: null,
    webgpu: false,
    webgpuDevice: null,
    webgpuArch: null,
    isAppleSilicon: false,
    totalUsableRAM: null,
    platform: input.platform ?? null,
    cpuBenchmark: null,
    isMobile: input.mobile === true,
    deviceName: name,
    ...partial,
  };
}

export function resolveHardware(
  input: HardwareInput | null | undefined,
): { ok: true; value: ResolvedHardware } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "missing_hardware" };
  }

  const ramGb = toPositiveNumber(input.ramGb ?? input.ram);
  const gpuName = input.gpu?.name?.trim() || null;
  let vram = toPositiveNumber(input.gpu?.vramGb);
  let bw = toPositiveNumber(input.gpu?.memoryBandwidthGbps);

  // Apple Silicon uses unified memory — treat separately from discrete GPUs.
  const appleMatch = gpuName ? matchApple(gpuName) : null;
  const isApple =
    input.appleSilicon === true ||
    (input.appleSilicon !== false &&
      !!gpuName &&
      (isAppleSiliconCheck(gpuName) || !!appleMatch));

  if (isApple) {
    if (bw == null) bw = appleMatch?.bw ?? null;
    const totalRAM = ramGb ?? appleMatch?.ram ?? null;
    if (totalRAM == null) {
      return { ok: false, error: "missing_ram_for_apple_silicon" };
    }
    const hw = baseHardware(input, {
      isAppleSilicon: true,
      totalUsableRAM: totalRAM,
      ramGB: totalRAM,
      estimatedVRAM: null,
      systemRAM: null,
      memoryBandwidth: bw,
      platform: input.platform ?? "macOS",
    });
    return {
      ok: true,
      value: {
        hw,
        detected: {
          kind: "apple-silicon",
          device: gpuName,
          vramGb: null,
          ramGb: totalRAM,
          memoryBandwidthGbps: bw,
        },
      },
    };
  }

  // Enrich from the GPU database when the caller only supplies a name.
  const gpuMatch = gpuName ? matchGPU(gpuName) : null;
  if (gpuMatch) {
    if (vram == null) vram = gpuMatch.vram || null;
    if (bw == null) bw = gpuMatch.bw || null;
  }

  // Discrete GPU with dedicated VRAM.
  if (vram != null && vram > 0) {
    const hw = baseHardware(input, {
      isAppleSilicon: false,
      estimatedVRAM: vram,
      totalUsableRAM: vram,
      ramGB: vram,
      systemRAM: ramGb ?? 16,
      memoryBandwidth: bw,
    });
    return {
      ok: true,
      value: {
        hw,
        detected: {
          kind: "gpu",
          device: gpuName,
          vramGb: vram,
          ramGb: ramGb,
          memoryBandwidthGbps: bw,
        },
      },
    };
  }

  // CPU / integrated GPU — inference runs out of system RAM.
  if (ramGb == null) {
    return { ok: false, error: "missing_ram_or_vram" };
  }
  const hw = baseHardware(input, {
    isAppleSilicon: false,
    estimatedVRAM: null,
    totalUsableRAM: ramGb,
    ramGB: ramGb,
    systemRAM: ramGb,
    // Assume DDR5 dual-channel when no bandwidth is provided.
    memoryBandwidth: bw ?? 50,
  });
  return {
    ok: true,
    value: {
      hw,
      detected: {
        kind: "cpu",
        device: gpuName,
        vramGb: null,
        ramGb,
        memoryBandwidthGbps: bw ?? 50,
      },
    },
  };
}

// ── Model lookup ───────────────────────────────────────────

export function findModel(modelId: string): AIModel | null {
  const norm = normalizeId(modelId);
  if (!norm) return null;
  return (
    models.find((m) => m.id.toLowerCase() === modelId.toLowerCase()) ??
    models.find((m) => normalizeId(m.id) === norm) ??
    models.find((m) => m.ollamaId && normalizeId(m.ollamaId) === norm) ??
    null
  );
}

function findQuant(model: AIModel, quantName: string): Quantization | null {
  const norm = normalizeId(quantName);
  return model.quants.find((q) => normalizeId(q.name) === norm) ?? null;
}

// Highest-quality quantization that still runs comfortably, falling back to the
// smallest quant when nothing fits.
function pickBestFitQuant(model: AIModel, hw: HardwareInfo): Quantization {
  const byQuality = [...model.quants].sort((a, b) => b.bits - a.bits);
  let firstComfortable: Quantization | null = null;
  let firstTight: Quantization | null = null;
  for (const quant of byQuality) {
    const ev = evaluateModelComplete(
      quant.vramGB,
      hw,
      model.paramsBillions,
      { activeParamsBillions: getActiveParamsBillions(model) },
    );
    if (ev.status === "can-run" && !firstComfortable) firstComfortable = quant;
    if ((ev.status === "tight" || ev.status === "can-run-slow") && !firstTight) firstTight = quant;
  }
  return firstComfortable ?? firstTight ?? byQuality[byQuality.length - 1]!;
}

// ── Compatibility evaluation ───────────────────────────────

export interface CompatibilityResult {
  compatible: boolean;
  status: ApiStatus;
  grade: string;
  score: number;
  modelId: string;
  modelName: string;
  quantization: string;
  recommendedQuantization: string;
  estimated: {
    tokensPerSecond: number | null;
    modelSizeGb: number;
    vramRequiredGb: number;
    ramRequiredGb: number;
    memoryHeadroomGb: number | null;
  };
  notes: string[];
}

function availableMemoryGb(hw: HardwareInfo): number | null {
  if (hw.isAppleSilicon || hw.isMobile) return hw.totalUsableRAM;
  return hw.estimatedVRAM ?? hw.totalUsableRAM;
}

function buildNotes(
  model: AIModel,
  quant: Quantization,
  status: ModelStatus,
  headroom: number | null,
  toks: number | null,
  recommended: Quantization,
  isApple: boolean,
): string[] {
  const notes: string[] = [];
  const where = isApple ? "unified memory" : "GPU memory";

  if (status === "can-run") {
    notes.push(`The model should fit comfortably in ${where}.`);
  } else if (status === "tight") {
    notes.push(`The model fits but leaves little headroom — reduce context length if you hit out-of-memory errors.`);
  } else if (status === "can-run-slow") {
    notes.push(`The model exceeds available ${where} and will offload layers to system RAM, reducing speed.`);
  } else if (status === "cannot-run") {
    notes.push(`The model does not fit in available memory at ${quant.name}.`);
  }

  if (recommended.name !== quant.name) {
    notes.push(`${recommended.name} is the recommended quantization for this hardware.`);
  } else {
    notes.push(`${quant.name} is a good balance of quality and size for this hardware.`);
  }

  if (headroom != null && headroom > 0 && status !== "cannot-run") {
    notes.push(`About ${round1(headroom)} GB of memory headroom remains for context and KV cache.`);
  }

  if (toks != null) {
    notes.push(`Estimated at roughly ${toks} tokens/second based on memory bandwidth.`);
  }

  return notes;
}

export function evaluateCompatibility(
  hw: HardwareInfo,
  model: AIModel,
  quantName?: string | null,
):
  | { ok: true; value: CompatibilityResult }
  | { ok: false; error: string; available?: string[] } {
  let quant: Quantization;
  if (quantName) {
    const found = findQuant(model, quantName);
    if (!found) {
      return {
        ok: false,
        error: "invalid_quantization",
        available: model.quants.map((q) => q.name),
      };
    }
    quant = found;
  } else {
    quant = pickBestFitQuant(model, hw);
  }

  const recommended = pickBestFitQuant(model, hw);
  const ev = evaluateModelComplete(
    quant.vramGB,
    hw,
    model.paramsBillions,
    { activeParamsBillions: getActiveParamsBillions(model) },
  );
  const available = availableMemoryGb(hw);
  const headroom = available != null ? round1(available - quant.vramGB) : null;
  const compatible = ev.status !== "cannot-run" && ev.status !== "unknown";

  return {
    ok: true,
    value: {
      compatible,
      status: STATUS_MAP[ev.status],
      grade: ev.grade,
      score: ev.score,
      modelId: model.id,
      modelName: model.name,
      quantization: quant.name,
      recommendedQuantization: recommended.name,
      estimated: {
        tokensPerSecond: ev.toksPerSec,
        modelSizeGb: quant.diskGB,
        vramRequiredGb: quant.vramGB,
        ramRequiredGb: model.recommendedRamGB,
        memoryHeadroomGb: headroom,
      },
      notes: buildNotes(model, quant, ev.status, headroom, ev.toksPerSec, recommended, hw.isAppleSilicon),
    },
  };
}

// ── Recommendations ────────────────────────────────────────

export interface RecommendedEntry {
  modelId: string;
  name: string;
  provider: string;
  family: string;
  paramsBillions: number;
  quantization: string;
  status: ApiStatus;
  grade: string;
  score: number;
  estimatedTokensPerSecond: number | null;
  vramRequiredGb: number;
  diskSizeGb: number;
  url: string;
  useCase: string[];
}

const RELEASE_TS = models
  .map((m) => (m.releaseDate ? Date.parse(`${m.releaseDate}-01`) : NaN))
  .filter((n) => Number.isFinite(n));
const MIN_RELEASE = RELEASE_TS.length ? Math.min(...RELEASE_TS) : 0;
const MAX_RELEASE = RELEASE_TS.length ? Math.max(...RELEASE_TS) : 1;

function recencyScore(releaseDate: string | null): number {
  if (!releaseDate) return 0;
  const ts = Date.parse(`${releaseDate}-01`);
  if (!Number.isFinite(ts) || MAX_RELEASE <= MIN_RELEASE) return 0;
  return ((ts - MIN_RELEASE) / (MAX_RELEASE - MIN_RELEASE)) * 20;
}

function memorySweetSpotScore(memPct: number | null): number {
  if (memPct === null) return 0;
  return Math.max(0, 20 - Math.abs(memPct - 65) * 0.5);
}

function statusPreference(status: ModelStatus): number {
  if (status === "can-run") return 12;
  if (status === "tight") return 4;
  if (status === "can-run-slow") return -16;
  return -30;
}

function speedPenalty(toks: number | null): number {
  if (toks === null) return 0;
  if (toks >= 16) return 0;
  return -Math.min(25, (16 - toks) * 2.2);
}

// Picks the best quant for a model and returns it alongside the cross-model
// ranking score used to order recommendations (higher = better pick overall).
function rankModel(model: AIModel, hw: HardwareInfo): { entry: RecommendedEntry; rank: number } | null {
  const byQuality = [...model.quants].sort((a, b) => b.bits - a.bits);
  let best: { entry: RecommendedEntry; rank: number } | null = null;

  for (const quant of byQuality) {
    const ev = evaluateModelComplete(
      quant.vramGB,
      hw,
      model.paramsBillions,
      { activeParamsBillions: getActiveParamsBillions(model) },
    );
    if (ev.status === "cannot-run" || ev.status === "unknown") continue;

    const rank =
      ev.score * 0.45 +
      Math.min(56, Math.log2(model.paramsBillions + 1) * 10) +
      Math.min(24, model.paramsBillions * 0.45) +
      recencyScore(model.releaseDate) +
      memorySweetSpotScore(ev.memPct) +
      statusPreference(ev.status) +
      (model.tools ? 2 : 0) +
      (model.thinking ? 2 : 0) +
      (model.featured ? 1.5 : 0) +
      quant.bits * 1.1 +
      speedPenalty(ev.toksPerSec);

    if (!best || rank > best.rank) {
      best = {
        rank,
        entry: {
          modelId: model.id,
          name: model.name,
          provider: model.provider,
          family: model.family,
          paramsBillions: model.paramsBillions,
          quantization: quant.name,
          status: STATUS_MAP[ev.status],
          grade: ev.grade,
          score: ev.score,
          estimatedTokensPerSecond: ev.toksPerSec,
          vramRequiredGb: quant.vramGB,
          diskSizeGb: quant.diskGB,
          url: model.url,
          useCase: model.useCase,
        },
      };
    }
  }

  return best;
}

export interface RecommendOptions {
  useCase?: string | null;
  limit?: number | null;
}

export function recommendModels(hw: HardwareInfo, options: RecommendOptions = {}): RecommendedEntry[] {
  const useCase = options.useCase?.toLowerCase().trim() || null;
  const limit = Math.max(1, Math.min(25, Math.floor(options.limit || 5)));

  const pool = useCase
    ? models.filter((m) => m.useCase.some((u) => u.toLowerCase() === useCase))
    : models;

  const ranked: Array<{ entry: RecommendedEntry; rank: number }> = [];
  for (const model of pool) {
    if (!isCurrentInLineage(model, models)) continue;
    const result = rankModel(model, hw);
    if (result) ranked.push(result);
  }

  return ranked
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      if (b.entry.paramsBillions !== a.entry.paramsBillions) return b.entry.paramsBillions - a.entry.paramsBillions;
      return a.entry.name.localeCompare(b.entry.name);
    })
    .slice(0, limit)
    .map(({ entry }) => entry);
}

// ── Serialization ──────────────────────────────────────────

export function serializeModel(model: AIModel) {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    family: model.family,
    params: model.params,
    paramsBillions: model.paramsBillions,
    activeParams: model.activeParams ?? null,
    architecture: model.architecture,
    releaseDate: model.releaseDate,
    contextLength: model.contextLength,
    useCase: model.useCase,
    description: model.description,
    url: model.url,
    license: model.license ?? null,
    tools: model.tools ?? false,
    thinking: model.thinking ?? false,
    minRamGB: model.minRamGB,
    recommendedRamGB: model.recommendedRamGB,
    ollamaId: model.ollamaId ?? null,
    lmStudioId: model.lmStudioId ?? null,
    lineage: model.lineage ?? null,
    supersededBy: getLineageSuccessor(model, models)?.id ?? null,
    intelligenceIndex: getAaBenchmark(model.id)?.intelligence ?? null,
    quants: model.quants,
  };
}

export function serializeModelSummary(model: AIModel) {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    family: model.family,
    params: model.params,
    paramsBillions: model.paramsBillions,
    architecture: model.architecture,
    releaseDate: model.releaseDate,
    contextLength: model.contextLength,
    useCase: model.useCase,
    url: model.url,
    license: model.license ?? null,
  };
}
