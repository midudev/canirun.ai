import { pullModel } from "./pull";
import { log } from "@clack/prompts";
import type { RecommendedModel } from "./types";

interface HuggingFaceModelApi {
  id?: string;
  siblings?: Array<{ rfilename?: string }>;
}

const HF_METADATA_TTL_MS = 5 * 60 * 1000;
const HF_RESOLVE_CONCURRENCY = 4;
const metadataCache = new Map<string, {
  expiresAt: number;
  value: Promise<HuggingFaceModelApi | null>;
}>();
const sizeCache = new Map<string, {
  expiresAt: number;
  value: Promise<number | null>;
}>();
const searchCache = new Map<string, {
  expiresAt: number;
  value: Promise<string[]>;
}>();

export function clearHfResolutionCaches(): void {
  metadataCache.clear();
  sizeCache.clear();
  searchCache.clear();
}

const TRUSTED_GGUF_PUBLISHERS = new Set([
  "bartowski",
  "deepseek-ai",
  "google",
  "huggingfacetb",
  "lmstudio-community",
  "meta-llama",
  "meta-models",
  "microsoft",
  "minimaxai",
  "mistralai",
  "moonshotai",
  "nvidia",
  "openai",
  "qwen",
  "unsloth",
]);

export function getRepoFromModelUrl(modelUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(modelUrl);
  } catch {
    throw new Error(`Invalid model URL: ${modelUrl}`);
  }
  if (parsed.hostname !== "huggingface.co") {
    throw new Error(`Unsupported source host (${parsed.hostname}). Only Hugging Face is supported for now.`);
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Cannot parse Hugging Face repo from URL: ${modelUrl}`);
  }
  return `${parts[0]}/${parts[1]}`;
}

function stripNonAlnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreCandidate(filename: string, quantName: string): number {
  const lower = filename.toLowerCase();
  const stripped = stripNonAlnum(filename);
  const quantLower = quantName.toLowerCase();
  const quantStripped = stripNonAlnum(quantName);
  let score = 0;
  if (lower.includes(quantLower)) score += 100;
  else if (stripped.includes(quantStripped)) score += 80;
  if (lower.includes("instruct")) score += 5;
  if (lower.includes("chat")) score += 3;
  if (lower.includes("q4_")) score += 2;
  if (lower.includes("q5_")) score += 2;
  if (lower.includes("q6_")) score += 2;
  if (lower.includes("q8_")) score += 1;
  return score;
}

function isMainModelGGUF(fileName: string): boolean {
  const normalized = fileName.toLowerCase();
  const blockedTokens = [
    "mmproj",
    "clip",
    "projector",
    "vision",
    "image",
    "encoder",
    "embed",
    "embedding",
    "rerank",
    "tei",
    "vocoder",
  ];
  return !blockedTokens.some((token) => normalized.includes(token));
}

export function pickBestGGUFFile(files: string[], quantName: string): string | undefined {
  const preferredFiles = files.filter(isMainModelGGUF);
  const ranked = [...(preferredFiles.length > 0 ? preferredFiles : files)]
    .map((filename) => ({
      filename,
      score: scoreCandidate(filename, quantName),
    }))
    .sort((a, b) => b.score - a.score || a.filename.length - b.filename.length);
  return ranked[0]?.filename;
}

async function fetchRepoMetadata(repo: string): Promise<HuggingFaceModelApi | null> {
  const cached = metadataCache.get(repo);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const metadataUrl = `https://huggingface.co/api/models/${repo}`;
  const value = (async () => {
    try {
      const response = await fetch(metadataUrl);
      if (!response.ok) return null;
      return await response.json() as HuggingFaceModelApi;
    } catch {
      return null;
    }
  })();
  metadataCache.set(repo, {
    expiresAt: Date.now() + HF_METADATA_TTL_MS,
    value,
  });
  return value;
}

function getGGUFFiles(payload: HuggingFaceModelApi): string[] {
  return (payload.siblings || [])
    .map((item) => item.rfilename || "")
    .filter((name) => name.toLowerCase().endsWith(".gguf"));
}

function normalizeModelName(value: string): string {
  return value
    .toLowerCase()
    .replace(/-gguf$/, "")
    .replace(/[^a-z0-9]/g, "");
}

function directRepoCandidates(sourceRepo: string): string[] {
  const [owner, rawName] = sourceRepo.split("/");
  const names = new Set([rawName]);
  if (!/-gguf$/i.test(rawName)) {
    names.add(`${rawName}-GGUF`);
    if (!/(instruct|chat)/i.test(rawName)) names.add(`${rawName}-Instruct-GGUF`);
  }

  const repos = new Set<string>([sourceRepo]);
  for (const name of names) {
    repos.add(`${owner}/${name}`);
    repos.add(`lmstudio-community/${name}`);
    repos.add(`bartowski/${name}`);
    repos.add(`unsloth/${name}`);
  }
  return [...repos];
}

async function searchTrustedGGUFRepos(sourceRepo: string): Promise<string[]> {
  const cached = searchCache.get(sourceRepo);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = searchTrustedGGUFReposUncached(sourceRepo);
  searchCache.set(sourceRepo, {
    expiresAt: Date.now() + HF_METADATA_TTL_MS,
    value,
  });
  return value;
}

async function searchTrustedGGUFReposUncached(sourceRepo: string): Promise<string[]> {
  const sourceName = sourceRepo.split("/")[1] || sourceRepo;
  const query = sourceName
    .replace(/-(instruct|chat)(-.+)?$/i, "")
    .replace(/-gguf$/i, "");
  const url = new URL("https://huggingface.co/api/models");
  url.searchParams.set("search", `${query} GGUF`);
  url.searchParams.set("filter", "gguf");
  url.searchParams.set("sort", "downloads");
  url.searchParams.set("direction", "-1");
  url.searchParams.set("limit", "30");

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const results = await response.json() as HuggingFaceModelApi[];
    const normalizedSource = normalizeModelName(sourceName);
    return results
      .map((result) => result.id || "")
      .filter((id) => {
        const [publisher, name] = id.split("/");
        if (!publisher || !name || !TRUSTED_GGUF_PUBLISHERS.has(publisher.toLowerCase())) {
          return false;
        }
        const normalizedCandidate = normalizeModelName(name);
        return (
          normalizedCandidate.includes(normalizedSource)
          || normalizedSource.includes(normalizedCandidate)
        );
      });
  } catch {
    return [];
  }
}

function formatDownloadSize(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.ceil(bytes / (1024 ** 2))} MB`;
}

async function getRemoteFileSize(url: string): Promise<number | null> {
  const cached = sizeCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = (async () => {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (!response.ok) return null;
      const bytes = Number(response.headers.get("content-length") || "0");
      return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
    } catch {
      return null;
    }
  })();
  sizeCache.set(url, {
    expiresAt: Date.now() + HF_METADATA_TTL_MS,
    value,
  });
  return value;
}

type DownloadableModel = Pick<
  RecommendedModel,
  "id" | "name" | "sourceUrl" | "ggufRepo" | "quant"
>;

export async function resolveHfGGUFDownload(model: DownloadableModel): Promise<{
  url: string;
  repo: string;
  file: string;
  sizeBytes: number | null;
}> {
  const sourceRepo = getRepoFromModelUrl(model.sourceUrl);
  const tryCandidates = async (candidates: string[]) => {
    const uniqueCandidates = [...new Set(candidates)];
    for (let index = 0; index < uniqueCandidates.length; index += HF_RESOLVE_CONCURRENCY) {
      const batch = uniqueCandidates.slice(index, index + HF_RESOLVE_CONCURRENCY);
      const matches = await Promise.all(batch.map(async (repo) => {
        const metadata = await fetchRepoMetadata(repo);
        if (!metadata) return null;
        const file = pickBestGGUFFile(getGGUFFiles(metadata), model.quant);
        return file ? { repo, file } : null;
      }));
      const match = matches.find((candidate) => candidate !== null);
      if (!match) continue;

      const encodedFile = encodeURIComponent(match.file).replace(/%2F/g, "/");
      const url = `https://huggingface.co/${match.repo}/resolve/main/${encodedFile}?download=true`;
      const sizeBytes = await getRemoteFileSize(url);
      return { url, repo: match.repo, file: match.file, sizeBytes };
    }
    return null;
  };

  const directCandidates = model.ggufRepo
    ? [model.ggufRepo, ...directRepoCandidates(sourceRepo)]
    : directRepoCandidates(sourceRepo);
  const directMatch = await tryCandidates(directCandidates);
  if (directMatch) return directMatch;

  const searchedMatch = await tryCandidates(await searchTrustedGGUFRepos(sourceRepo));
  if (searchedMatch) {
    return searchedMatch;
  }

  throw new Error(
    `No compatible ${model.quant} GGUF was found for ${model.name} in its official or trusted community repositories. `
    + "Try another model or pass a direct GGUF URL to `runai pull`.",
  );
}

export async function installCatalogModel(model: DownloadableModel): Promise<{
  path: string;
  sourceRepo: string;
  sourceFile: string;
  sourceUrl: string;
}> {
  const resolved = await resolveHfGGUFDownload(model);
  log.info(`Source: ${resolved.repo}`);
  log.info(`File: ${resolved.file}`);
  if (resolved.sizeBytes) log.info(`Download: ${formatDownloadSize(resolved.sizeBytes)}`);
  console.log("");
  const installedPath = await pullModel(resolved.url, `${model.id}.gguf`, model.id);
  log.success(`Saved at ${installedPath}`);
  return {
    path: installedPath,
    sourceRepo: resolved.repo,
    sourceFile: resolved.file,
    sourceUrl: resolved.url,
  };
}

export async function installHuggingFaceModel(
  sourceUrl: string,
  id: string,
  quant = "Q4_K_M",
): ReturnType<typeof installCatalogModel> {
  return installCatalogModel({ id, name: id, sourceUrl, quant });
}

