#!/usr/bin/env -S pnpm exec tsx
/**
 * Fetch README HTML content from Ollama library pages for all models
 * that have an ollamaId. Stores the result in src/data/ollama-readmes.json.
 *
 * Usage:
 *   pnpm exec tsx scripts/fetch-ollama-readmes.ts
 *   pnpm exec tsx scripts/fetch-ollama-readmes.ts --force   # re-fetch all, ignoring cache
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const BASE = "https://ollama.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const RATE_LIMIT_MS = 200;
const CONCURRENCY = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e: any) {
      if (i === retries - 1) throw e;
      await sleep(500 * (i + 1));
    }
  }
  throw new Error("Unreachable");
}

function extractReadmeHTML(html: string): string | null {
  const readmeIdx = html.indexOf('id="readme"');
  if (readmeIdx === -1) return null;

  const proseMatch = html.indexOf("prose", readmeIdx);
  if (proseMatch === -1) return null;

  const openTagEnd = html.indexOf(">", proseMatch);
  if (openTagEnd === -1) return null;

  const contentStart = openTagEnd + 1;

  let depth = 1;
  let pos = contentStart;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf("<div", pos);
    const nextClose = html.indexOf("</div>", pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        let content = html.slice(contentStart, nextClose).trim();
        content = content.replace(/src="\/assets\//g, `src="${BASE}/assets/`);
        content = content.replace(/href="\/library\//g, `href="${BASE}/library/`);
        return content;
      }
      pos = nextClose + 6;
    }
  }

  return null;
}

function getOllamaSlugMap(): Map<string, string> {
  const modelsPath = resolve(import.meta.dirname ?? ".", "..", "src", "data", "models.ts");
  const content = readFileSync(modelsPath, "utf-8");

  const slugMap = new Map<string, string>();
  const lines = content.split("\n");
  for (const line of lines) {
    const idMatch = line.match(/id:\s*"([^"]+)"/);
    const ollamaMatch = line.match(/ollamaId:\s*"([^"]+)"/);
    if (idMatch && ollamaMatch) {
      const slug = ollamaMatch[1].split(":")[0];
      slugMap.set(idMatch[1], slug);
    }
  }

  return slugMap;
}

async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i]);
      await sleep(RATE_LIMIT_MS);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

async function main() {
  const force = process.argv.includes("--force");
  const outputPath = resolve(import.meta.dirname ?? ".", "..", "src", "data", "ollama-readmes.json");

  let existing: Record<string, string> = {};
  if (!force && existsSync(outputPath)) {
    existing = JSON.parse(readFileSync(outputPath, "utf-8"));
  }

  const slugMap = getOllamaSlugMap();
  const uniqueSlugs = new Map<string, string[]>();
  for (const [modelId, slug] of slugMap) {
    if (!uniqueSlugs.has(slug)) uniqueSlugs.set(slug, []);
    uniqueSlugs.get(slug)!.push(modelId);
  }

  console.log(`📖 Ollama README Fetcher`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  Models with ollamaId: ${slugMap.size}`);
  console.log(`  Unique Ollama slugs:  ${uniqueSlugs.size}`);

  const alreadyCached = force ? 0 : [...uniqueSlugs.keys()].filter((slug) => {
    const modelIds = uniqueSlugs.get(slug)!;
    return modelIds.some((id) => existing[id]);
  }).length;

  console.log(`  Already cached:       ${alreadyCached}`);
  console.log(`  To fetch:             ${uniqueSlugs.size - alreadyCached}\n`);

  const results: Record<string, string> = { ...existing };
  let fetched = 0;
  let errors = 0;

  const slugsToFetch = [...uniqueSlugs.entries()].filter(([slug, modelIds]) => {
    if (force) return true;
    return !modelIds.some((id) => existing[id]);
  });

  await pool(slugsToFetch, CONCURRENCY, async ([slug, modelIds]) => {
    try {
      const html = await fetchPage(`${BASE}/library/${slug}`);
      const readme = extractReadmeHTML(html);

      fetched++;
      if (readme && readme.length > 50) {
        for (const id of modelIds) {
          results[id] = readme;
        }
        process.stdout.write(
          `\r  [${fetched}/${slugsToFetch.length}] ✓ ${slug.padEnd(30)} ${readme.length} chars`,
        );
      } else {
        process.stdout.write(
          `\r  [${fetched}/${slugsToFetch.length}] ⚠ ${slug.padEnd(30)} no readme found`,
        );
      }
    } catch (e: any) {
      fetched++;
      errors++;
      process.stdout.write(
        `\r  [${fetched}/${slugsToFetch.length}] ✗ ${slug.padEnd(30)} ${e.message}`,
      );
    }
  });

  console.log("\n");

  writeFileSync(outputPath, JSON.stringify(results, null, 2));

  const total = Object.keys(results).length;
  console.log(`  ✅ Wrote ${total} readmes to src/data/ollama-readmes.json`);
  if (errors > 0) console.log(`  ⚠  ${errors} errors`);
  console.log("  Done!");
}

main().catch(console.error);
