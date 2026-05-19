#!/usr/bin/env -S pnpm exec tsx
/**
 * Fetches download counts and likes from HuggingFace API for all models.
 * Outputs src/data/hf-stats.json consumed at build time.
 *
 * Usage: pnpm exec tsx scripts/fetch-hf-stats.ts
 */

import { models } from "../src/data/models";
import { writeFileSync } from "fs";
import { join } from "path";

interface HFStats {
  downloads: number;
  likes: number;
}

const RATE_LIMIT_MS = 100; // Be polite to HF API
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchStats(hfUrl: string): Promise<HFStats | null> {
  // Extract repo id from URL like https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct
  const match = hfUrl.match(/huggingface\.co\/([^/]+\/[^/]+)/);
  if (!match) return null;

  const repoId = match[1];
  try {
    const res = await fetch(`https://huggingface.co/api/models/${repoId}`, {
      headers: { "User-Agent": "canirun-scraper/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      downloads: data.downloads || 0,
      likes: data.likes || 0,
    };
  } catch {
    return null;
  }
}

async function main() {
  const stats: Record<string, HFStats> = {};
  let done = 0;

  for (const model of models) {
    const result = await fetchStats(model.url);
    if (result) {
      stats[model.id] = result;
      console.log(`[${++done}/${models.length}] ${model.id}: ${formatNum(result.downloads)} downloads, ${result.likes} likes`);
    } else {
      console.log(`[${++done}/${models.length}] ${model.id}: SKIP`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  const outPath = join(import.meta.dir, "../src/data/hf-stats.json");
  writeFileSync(outPath, JSON.stringify(stats, null, 2));
  console.log(`\nWrote ${Object.keys(stats).length} entries to ${outPath}`);
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

main();
