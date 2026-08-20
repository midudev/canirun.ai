import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  RUNAI_GITHUB_RELEASES_URL,
  RUNAI_NPM_LATEST_URL,
  RUNAI_UPDATE_CACHE_PATH,
  RUNAI_UPDATE_CHECK_DISABLED,
  RUNAI_UPDATE_CHECK_TTL_MS,
  RUNAI_VERSION,
} from "./config";

const FETCH_TIMEOUT_MS = 2000;

export interface UpdateCache {
  checkedAt: number;
  latestVersion: string;
}

export type UpdateCheck =
  | { state: "current"; current: string; latest: string }
  | { state: "outdated"; current: string; latest: string }
  | { state: "unknown"; current: string };

export interface FetchLatestOptions {
  fetchImpl?: typeof fetch;
  npmUrl?: string;
  githubUrl?: string;
}

export function normalizeVersionTag(tag: string): string {
  return tag.trim().replace(/^(runai-)?v?/i, "");
}

export function parseSemver(version: string): [number, number, number] | null {
  const match = normalizeVersionTag(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVersionNewer(latest: string, current: string): boolean {
  const next = parseSemver(latest);
  const installed = parseSemver(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i += 1) {
    if (next[i] !== installed[i]) return next[i]! > installed[i]!;
  }
  return false;
}

export function isCacheFresh(cache: UpdateCache, now = Date.now(), ttlMs = RUNAI_UPDATE_CHECK_TTL_MS): boolean {
  return now - cache.checkedAt < ttlMs;
}

export function parseNpmLatest(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const version = (payload as { version?: unknown }).version;
  if (typeof version !== "string" || !parseSemver(version)) return null;
  return normalizeVersionTag(version);
}

export function parseGitHubLatest(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const tag = (payload as { tag_name?: unknown }).tag_name;
  if (typeof tag !== "string") return null;
  const version = normalizeVersionTag(tag);
  return parseSemver(version) ? version : null;
}

function toUpdateCheck(latest: string, current = RUNAI_VERSION): UpdateCheck {
  return isVersionNewer(latest, current)
    ? { state: "outdated", current, latest }
    : { state: "current", current, latest };
}

export function isSourceCheckout(cliPath = process.argv[1] ?? ""): boolean {
  const normalized = cliPath.replaceAll("\\", "/");
  return normalized.includes("/packages/runai/src/")
    || normalized.endsWith("/src/cli.ts");
}

async function readCache(path = RUNAI_UPDATE_CACHE_PATH): Promise<UpdateCache | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf-8")) as Partial<UpdateCache>;
    if (
      typeof parsed.checkedAt === "number"
      && Number.isFinite(parsed.checkedAt)
      && typeof parsed.latestVersion === "string"
      && parseSemver(parsed.latestVersion)
    ) {
      return { checkedAt: parsed.checkedAt, latestVersion: parsed.latestVersion };
    }
  } catch {
    // Missing or invalid cache is fine; the next fetch will replace it.
  }
  return null;
}

async function writeCache(latestVersion: string, path = RUNAI_UPDATE_CACHE_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const cache: UpdateCache = { checkedAt: Date.now(), latestVersion };
  await writeFile(path, JSON.stringify(cache));
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": `runai/${RUNAI_VERSION}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLatestVersion(options: FetchLatestOptions = {}): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const [npmPayload, githubPayload] = await Promise.all([
    fetchJson(options.npmUrl ?? RUNAI_NPM_LATEST_URL, fetchImpl),
    fetchJson(options.githubUrl ?? RUNAI_GITHUB_RELEASES_URL, fetchImpl),
  ]);
  return parseNpmLatest(npmPayload) ?? parseGitHubLatest(githubPayload);
}

export async function checkForCliUpdate(options: {
  force?: boolean;
  fetchImpl?: typeof fetch;
} = {}): Promise<UpdateCheck> {
  const current = RUNAI_VERSION;
  if (!options.force && RUNAI_UPDATE_CHECK_DISABLED) {
    return { state: "unknown", current };
  }

  const cache = await readCache();
  if (!options.force && cache && isCacheFresh(cache)) {
    return toUpdateCheck(cache.latestVersion, current);
  }

  const latest = await fetchLatestVersion({ fetchImpl: options.fetchImpl });
  if (latest) {
    try {
      await writeCache(latest);
    } catch {
      // Cache write is best-effort; the version check still succeeded.
    }
    return toUpdateCheck(latest, current);
  }

  if (cache) return toUpdateCheck(cache.latestVersion, current);
  return { state: "unknown", current };
}
