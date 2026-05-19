#!/usr/bin/env -S pnpm exec tsx
/**
 * Fetches real GGUF file sizes from HuggingFace for all catalog models.
 * Outputs src/data/gguf-sizes.json consumed by models.ts to override estimated disk sizes.
 *
 * Usage: pnpm exec tsx scripts/fetch-gguf-sizes.ts
 */

import { models } from "../src/data/models";
import { writeFileSync } from "fs";
import { join } from "path";

const RATE_LIMIT_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QUANT_NAMES = ["Q2_K", "Q3_K_M", "Q4_K_M", "Q5_K_M", "Q6_K", "Q8_0", "F16"];

const BLOCKED_TOKENS = [
  "mmproj", "clip", "projector", "vision", "image",
  "encoder", "embed", "embedding", "rerank", "tei", "vocoder",
];

interface HFTreeEntry {
  type: string;
  path: string;
  size?: number;
  lfs?: { size: number };
}

type SizeMap = Record<string, number>;

function extractRepo(hfUrl: string): string | null {
  const match = hfUrl.match(/huggingface\.co\/([^/]+\/[^/]+)/);
  return match ? match[1] : null;
}

function isMainModelGGUF(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".gguf")) return false;
  return !BLOCKED_TOKENS.some((t) => lower.includes(t));
}

function stripNonAlnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchQuantToFile(files: { name: string; sizeGB: number }[], quantName: string): number | null {
  const quantLower = quantName.toLowerCase();
  const quantStripped = stripNonAlnum(quantName);

  let best: { name: string; sizeGB: number; score: number } | null = null;

  for (const file of files) {
    const lower = file.name.toLowerCase();
    const stripped = stripNonAlnum(file.name);
    let score = 0;

    if (lower.includes(quantLower)) score += 100;
    else if (stripped.includes(quantStripped)) score += 80;
    else continue;

    if (!best || score > best.score || (score === best.score && file.name.length < best.name.length)) {
      best = { ...file, score };
    }
  }

  return best?.sizeGB ?? null;
}

async function fetchTreeFiles(repo: string): Promise<{ name: string; sizeGB: number }[]> {
  const url = `https://huggingface.co/api/models/${repo}/tree/main`;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "canirun-scraper/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return [];

    const entries = (await resp.json()) as HFTreeEntry[];
    return entries
      .filter((e) => e.type === "file" && isMainModelGGUF(e.path))
      .map((e) => {
        const sizeBytes = e.lfs?.size ?? e.size ?? 0;
        return {
          name: e.path.split("/").pop() || e.path,
          sizeGB: Math.round((sizeBytes / (1024 ** 3)) * 10) / 10,
        };
      })
      .filter((f) => f.sizeGB > 0);
  } catch {
    return [];
  }
}

async function main() {
  const result: Record<string, SizeMap> = {};
  let done = 0;
  let matched = 0;

  const uniqueUrls = new Map<string, string[]>();
  for (const model of models) {
    const repo = extractRepo(model.url);
    if (!repo) continue;
    if (!uniqueUrls.has(repo)) uniqueUrls.set(repo, []);
    uniqueUrls.get(repo)!.push(model.id);
  }

  console.log(`Fetching GGUF sizes for ${models.length} models (${uniqueUrls.size} unique repos)...\n`);

  for (const model of models) {
    const repo = extractRepo(model.url);
    done++;
    if (!repo) {
      console.log(`[${done}/${models.length}] ${model.id}: SKIP (no HF URL)`);
      continue;
    }

    const files = await fetchTreeFiles(repo);
    if (files.length === 0) {
      console.log(`[${done}/${models.length}] ${model.id}: SKIP (no GGUF files in ${repo})`);
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    const sizes: SizeMap = {};
    for (const quantName of QUANT_NAMES) {
      const size = matchQuantToFile(files, quantName);
      if (size !== null) {
        sizes[quantName] = size;
      }
    }

    if (Object.keys(sizes).length > 0) {
      result[model.id] = sizes;
      matched++;
      const q4 = sizes.Q4_K_M ? `Q4=${sizes.Q4_K_M}GB` : "";
      const q5 = sizes.Q5_K_M ? `Q5=${sizes.Q5_K_M}GB` : "";
      console.log(`[${done}/${models.length}] ${model.id}: ${Object.keys(sizes).length} quants  ${q4} ${q5}`);
    } else {
      console.log(`[${done}/${models.length}] ${model.id}: no quant matches in ${files.length} files`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  const outPath = join(import.meta.dir, "../src/data/gguf-sizes.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n✅ Wrote ${matched} model entries to ${outPath}`);
}

main().catch(console.error);
