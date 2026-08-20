import { readdirSync } from "node:fs";
import {
  getActiveParamsBillions,
  isCurrentInLineage,
  models,
  type AIModel,
} from "@canirun/models";
import { evaluateModelComplete } from "@canirun/compatibility";
import type { RecommendedModel, CliHardwareInfo } from "./types";
import { RUNAI_MODEL_DIR } from "./config";

let _installedFileSet: Set<string> | null = null;
let _installedFileSetAge = 0;
const INSTALLED_CACHE_TTL_MS = 5_000;

function getInstalledFileSet(): Set<string> {
  const now = Date.now();
  if (_installedFileSet && now - _installedFileSetAge < INSTALLED_CACHE_TTL_MS) {
    return _installedFileSet;
  }
  try {
    const entries = readdirSync(RUNAI_MODEL_DIR);
    _installedFileSet = new Set(entries.map((e) => typeof e === "string" ? e.toLowerCase() : ""));
  } catch {
    _installedFileSet = new Set();
  }
  _installedFileSetAge = now;
  return _installedFileSet;
}

function isModelInstalled(modelId: string): boolean {
  const set = getInstalledFileSet();
  const fileName = modelId.endsWith(".gguf") ? modelId.toLowerCase() : `${modelId.toLowerCase()}.gguf`;
  return set.has(fileName);
}

const catalogModels: AIModel[] = models.filter((model) => model.quants.length > 0);
type CatalogModel = AIModel;

function parseReleaseDate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}-01`);
  return Number.isFinite(parsed) ? parsed : null;
}

const releaseTimeline = catalogModels
  .map((model) => parseReleaseDate(model.releaseDate))
  .filter((value): value is number => value !== null);
const minReleaseTs = releaseTimeline.length ? Math.min(...releaseTimeline) : 0;
const maxReleaseTs = releaseTimeline.length ? Math.max(...releaseTimeline) : 1;

function recencyScore(releaseDate: string | null): number {
  const ts = parseReleaseDate(releaseDate);
  if (ts === null || maxReleaseTs <= minReleaseTs) return 0;
  const normalized = (ts - minReleaseTs) / (maxReleaseTs - minReleaseTs);
  return normalized * 20;
}

function memorySweetSpotScore(memPct: number | null): number {
  if (memPct === null) return 0;
  const distance = Math.abs(memPct - 65);
  return Math.max(0, 20 - distance * 0.5);
}

function paramsQualityScore(paramsBillions: number): number {
  return Math.min(56, Math.log2(paramsBillions + 1) * 10);
}

function statusPreference(status: RecommendedModel["status"]): number {
  if (status === "can-run") return 12;
  if (status === "tight") return 4;
  if (status === "can-run-slow") return -16;
  return -30;
}

function speedPenalty(toksPerSec: number | null): number {
  if (toksPerSec === null) return 0;
  if (toksPerSec >= 16) return 0;
  return -Math.min(25, (16 - toksPerSec) * 2.2);
}

function modelCapabilityBonus(model: CatalogModel): number {
  let bonus = 0;
  if (model.tools) bonus += 2;
  if (model.thinking) bonus += 2;
  if (model.featured) bonus += 1.5;
  return bonus;
}

export function inferenceParamsBillions(model: CatalogModel): number {
  return getActiveParamsBillions(model);
}

function computeRankingScore(
  model: CatalogModel,
  quantBits: number,
  evalScore: number,
  status: RecommendedModel["status"],
  toksPerSec: number | null,
  memPct: number | null,
): number {
  const score =
    evalScore * 0.45
    + paramsQualityScore(model.paramsBillions)
    + Math.min(24, model.paramsBillions * 0.45)
    + recencyScore(model.releaseDate)
    + memorySweetSpotScore(memPct)
    + statusPreference(status)
    + modelCapabilityBonus(model)
    + (quantBits * 1.1)
    + speedPenalty(toksPerSec);
  return Math.round(score);
}

function compareRecommendations(a: RecommendedModel, b: RecommendedModel): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.paramsBillions !== a.paramsBillions) return b.paramsBillions - a.paramsBillions;
  if (a.memoryNeededGB !== b.memoryNeededGB) return b.memoryNeededGB - a.memoryNeededGB;
  return a.name.localeCompare(b.name);
}

function toRecommended(
  model: CatalogModel,
  quant: CatalogModel["quants"][number],
  hw: CliHardwareInfo,
): RecommendedModel {
  const activeParamsBillions = inferenceParamsBillions(model);
  const evalResult = evaluateModelComplete(
    quant.vramGB,
    hw,
    model.paramsBillions,
    { activeParamsBillions },
  );
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    ollamaId: model.ollamaId,
    sourceUrl: model.url,
    ggufRepo: model.ggufRepo,
    quant: quant.name,
    score: Math.round(computeRankingScore(
      model,
      quant.bits,
      evalResult.score,
      evalResult.status,
      evalResult.toksPerSec,
      evalResult.memPct,
    )),
    grade: evalResult.grade,
    status: evalResult.status,
    expectedTokensPerSec: evalResult.toksPerSec,
    memoryNeededGB: quant.vramGB,
    diskNeededGB: quant.diskGB,
    paramsBillions: model.paramsBillions,
    activeParamsBillions,
    downloaded: isModelInstalled(model.id),
  };
}

function pickBestQuant(
  model: CatalogModel,
  hw: CliHardwareInfo,
  options: { includeUnfit?: boolean } = {},
): RecommendedModel | null {
  const byQuality = [...model.quants].sort((a, b) => b.bits - a.bits);
  let best: RecommendedModel | null = null;
  let fallback: RecommendedModel | null = null;

  for (const quant of byQuality) {
    const candidate = toRecommended(model, quant, hw);
    const unfit = candidate.status === "cannot-run" || candidate.status === "unknown";
    if (unfit) {
      if (
        options.includeUnfit
        && (!fallback || candidate.memoryNeededGB < fallback.memoryNeededGB)
      ) {
        fallback = candidate;
      }
      continue;
    }
    if (
      !best
      || candidate.score > best.score
      || (candidate.score === best.score && candidate.paramsBillions > best.paramsBillions)
    ) {
      best = candidate;
    }
  }

  return best ?? fallback ?? null;
}

function isGenerationOnly(model: CatalogModel): boolean {
  const uses = model.useCase ?? [];
  return uses.length > 0 && uses.every((use) => use === "image" || use === "video");
}

export function recommendTopModels(hw: CliHardwareInfo, limit = 3): RecommendedModel[] {
  const candidates: RecommendedModel[] = [];
  for (const model of catalogModels) {
    if (!isCurrentInLineage(model, catalogModels)) continue;
    if (isGenerationOnly(model)) continue;
    const best = pickBestQuant(model, hw);
    if (best) candidates.push(best);
  }
  return candidates.sort(compareRecommendations).slice(0, limit);
}

export type CatalogMatchKind = "exact" | "alias" | "prefix" | "fuzzy";

export interface CatalogMatch {
  model: RecommendedModel;
  kind: CatalogMatchKind;
  matchScore: number;
}

function compactToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function repoFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}`.toLowerCase() : "";
  } catch {
    return "";
  }
}

function normalizeQuery(name: string): {
  raw: string;
  withoutLatest: string;
  compact: string;
  repo: string | null;
} {
  let raw = name.trim().toLowerCase().replace(/\.gguf$/i, "");
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      raw = new URL(name.trim()).pathname.replace(/\/+$/, "").replace(/^\/+/, "");
    } catch {
      // keep the original trimmed query
    }
  }
  raw = raw.replace(/^\/+/, "");
  const withoutLatest = raw.endsWith(":latest") ? raw.slice(0, -7) : raw;
  const repo = withoutLatest.includes("/")
    ? withoutLatest.split("/").filter(Boolean).slice(0, 2).join("/")
    : null;
  return { raw, withoutLatest, compact: compactToken(withoutLatest), repo };
}

function scoreModelQuery(model: CatalogModel, query: string): {
  kind: CatalogMatchKind;
  score: number;
} | null {
  const q = normalizeQuery(query);
  if (!q.withoutLatest && !q.compact) return null;

  const id = model.id.toLowerCase();
  const name = model.name.toLowerCase();
  const ollama = model.ollamaId?.toLowerCase() ?? "";
  const ollamaFamily = ollama.split(":")[0] || "";
  const compactId = compactToken(id);
  const compactOllama = compactToken(ollama);
  const compactName = compactToken(name);
  const repo = repoFromUrl(model.url);
  const ggufRepo = model.ggufRepo?.toLowerCase() ?? "";

  if (id === q.raw || id === q.withoutLatest || compactId === q.compact) {
    return { kind: "exact", score: 1000 };
  }
  if (ollama && (ollama === q.raw || ollama === q.withoutLatest || compactOllama === q.compact)) {
    return { kind: "exact", score: 990 };
  }
  if (repo && (repo === q.withoutLatest || repo === q.repo)) {
    return { kind: "exact", score: 980 };
  }
  if (ggufRepo && (ggufRepo === q.withoutLatest || ggufRepo === q.repo)) {
    return { kind: "exact", score: 970 };
  }
  if (model.url.toLowerCase().replace(/\/$/, "") === q.raw.replace(/\/$/, "")) {
    return { kind: "exact", score: 960 };
  }
  if (q.raw.endsWith(":latest") && ollamaFamily && ollamaFamily === q.withoutLatest) {
    return { kind: "alias", score: 940 };
  }

  if (
    id.startsWith(q.withoutLatest)
    || compactId.startsWith(q.compact)
    || (ollama && (ollama.startsWith(q.withoutLatest) || compactOllama.startsWith(q.compact)))
  ) {
    const extra = Math.max(0, compactId.length - q.compact.length);
    return { kind: "prefix", score: 800 - extra };
  }

  if (
    name.includes(q.withoutLatest)
    || compactName.includes(q.compact)
    || id.includes(q.withoutLatest)
    || compactId.includes(q.compact)
    || compactOllama.includes(q.compact)
  ) {
    return { kind: "fuzzy", score: 400 };
  }

  if (
    model.family.toLowerCase() === q.withoutLatest
    || model.provider.toLowerCase() === q.withoutLatest
    || (model.useCase ?? []).some((use) => use.toLowerCase() === q.withoutLatest)
  ) {
    return { kind: "fuzzy", score: 220 };
  }

  const haystack = [
    name,
    model.provider,
    model.family,
    id,
    ollama,
    ...(model.useCase || []),
  ].join(" ").toLowerCase();
  if (haystack.includes(q.withoutLatest)) {
    return { kind: "fuzzy", score: 160 };
  }

  return null;
}

export function findCatalogMatches(
  query: string,
  hw: CliHardwareInfo,
  limit = 12,
): CatalogMatch[] {
  const scored: CatalogMatch[] = [];
  for (const model of catalogModels) {
    if (isGenerationOnly(model)) continue;
    const match = scoreModelQuery(model, query);
    if (!match) continue;
    if (
      (match.kind === "prefix" || match.kind === "fuzzy")
      && !isCurrentInLineage(model, catalogModels)
    ) {
      continue;
    }
    const includeUnfit = match.kind === "exact" || match.kind === "alias";
    const recommended = pickBestQuant(model, hw, { includeUnfit });
    if (!recommended) continue;
    scored.push({ model: recommended, kind: match.kind, matchScore: match.score });
  }
  scored.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return compareRecommendations(a.model, b.model);
  });
  return scored.slice(0, limit);
}

export function searchCatalog(query: string, hw: CliHardwareInfo, limit = 25): RecommendedModel[] {
  const q = query.toLowerCase().trim();
  if (!q) {
    const results: RecommendedModel[] = [];
    for (const model of catalogModels) {
      if (!isCurrentInLineage(model, catalogModels)) continue;
      if (isGenerationOnly(model)) continue;
      const best = pickBestQuant(model, hw);
      if (best) results.push(best);
    }
    return results.sort(compareRecommendations).slice(0, limit);
  }
  return findCatalogMatches(query, hw, limit).map((item) => item.model);
}

export function findModelByName(name: string, hw: CliHardwareInfo): RecommendedModel | null {
  const matches = findCatalogMatches(name, hw, 40);
  const exact = matches.filter((item) => item.kind === "exact" || item.kind === "alias");
  if (exact.length === 1) return exact[0]!.model;
  if (exact.length > 1) return exact[0]!.model;

  const prefixes = matches.filter((item) => item.kind === "prefix");
  if (prefixes.length === 1) return prefixes[0]!.model;

  return null;
}

export function getCatalogSize(): number {
  return catalogModels.length;
}
