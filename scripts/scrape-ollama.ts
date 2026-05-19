#!/usr/bin/env -S pnpm exec tsx
/**
 * Ultimate Ollama model catalog scraper.
 *
 * Strategy:
 * 1. Fetch ALL search pages via HTMX pagination (hx-get="/search?page=N")
 *    with both "popular" and "newest" sorts to catch every model.
 * 2. For each model slug:
 *    - Fetch /library/{slug}       → description, capabilities, pulls.
 *    - Fetch /library/{slug}/tags  → tag variants with size, params, context, quantization.
 * 3. Write structured JSON to out/ollama_models.json.
 * 4. Compare against src/data/models.ts and report missing models.
 *
 * Usage:
 *   pnpm exec tsx scripts/scrape-ollama.ts
 *   pnpm exec tsx scripts/scrape-ollama.ts --limit 10
 *   pnpm exec tsx scripts/scrape-ollama.ts --out src/data/ollama-catalog.json
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

const BASE = "https://ollama.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CONCURRENCY = 6;
const RATE_LIMIT_MS = 120;
const MAX_PAGES = 50; // safety limit

const NUM_ABBR: Record<string, number> = {
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
};
const CAPABILITY_KEYWORDS = new Set([
  "tools",
  "thinking",
  "vision",
  "embedding",
  "multimodal",
  "reasoning",
  "code",
  "cloud",
]);

// ── Types ─────────────────────────────────────────────────

interface Variant {
  tag: string;
  params: string | null;
  size_text: string | null;
  size_bytes: number | null;
  context: string | null;
  input: string | null;
  quantization: string | null;
}

interface OllamaModel {
  slug: string;
  name: string | null;
  pulls: number | null;
  pulls_text: string | null;
  capabilities: string[];
  blurb: string | null;
  description: string | null;
  updated: string | null;
  tags_count: number | null;
  variants: Variant[];
  default_params: string | null;
  default_size: string | null;
  available_sizes?: string[];
  error?: string;
}

interface ScrapedData {
  scraped_at: string;
  total_models: number;
  models: OllamaModel[];
}

// ── Fetch with retry ──────────────────────────────────────

async function fetchPage(
  url: string,
  headers: Record<string, string> = {},
  retries = 3
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, ...headers },
        signal: AbortSignal.timeout(30000),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Parse pulls ──────────────────────────────────────────

function parsePulls(text: string): number | null {
  const m = text.match(/([0-9]+(?:\.[0-9]+)?)([KMB])?/i);
  if (!m) return null;
  let num = parseFloat(m[1]);
  if (m[2]) num *= NUM_ABBR[m[2].toUpperCase()] || 1;
  return Math.round(num);
}

function parseSize(text: string): number | null {
  const m = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(KB|MB|GB|TB)/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const mult: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return Math.round(num * (mult[m[2].toUpperCase()] || 1));
}

// ── Parse search page (HTMX response) ────────────────────

function parseSearchPage(html: string): OllamaModel[] {
  const models: OllamaModel[] = [];

  // Each model is in an <li x-test-model> containing an <a> with model info
  // Split by x-test-model markers
  const items = html.split(/x-test-model/);

  for (let i = 1; i < items.length; i++) {
    const item = items[i];

    // Slug from x-test-search-response-title
    const slugMatch = item.match(
      /x-test-search-response-title[^>]*>([^<]+)/i
    );
    if (!slugMatch) continue;
    const slug = slugMatch[1].trim();

    // Pulls
    const pullsMatch = item.match(/x-test-pull-count[^>]*>([^<]+)/i);
    let pulls: number | null = null;
    let pullsText: string | null = null;
    if (pullsMatch) {
      const raw = pullsMatch[1].trim();
      pullsText = raw;
      pulls = parsePulls(raw);
    }

    // Blurb — first <p> after the title
    const blurbMatch = item.match(
      /<p[^>]*class="[^"]*break-words[^"]*"[^>]*>([^<]+)<\/p>/i
    );
    const blurb = blurbMatch ? blurbMatch[1].trim() : null;

    // Capabilities from colored badge spans
    const capabilities: string[] = [];
    const badgePattern =
      /<span[^>]*class="[^"]*(?:bg-(?:indigo|blue|green|purple|pink|cyan|yellow|red|orange|emerald|teal)-\d+)[^"]*"[^>]*>([^<]+)<\/span>/gi;
    let bm: RegExpExecArray | null;
    while ((bm = badgePattern.exec(item)) !== null) {
      const cap = bm[1].trim().toLowerCase();
      if (CAPABILITY_KEYWORDS.has(cap)) capabilities.push(cap);
    }

    // Tags count
    const tagsMatch = item.match(/x-test-tag-count[^>]*>([^<]+)/i);
    const tagsCount = tagsMatch ? parseInt(tagsMatch[1].trim()) || null : null;

    // Updated
    const updMatch = item.match(/x-test-updated[^>]*>([^<]+)/i);
    const updated = updMatch ? updMatch[1].trim() : null;

    models.push({
      slug,
      name: null,
      pulls,
      pulls_text: pullsText,
      capabilities: [...new Set(capabilities)].sort(),
      blurb,
      description: null,
      updated,
      tags_count: tagsCount,
      variants: [],
      default_params: null,
      default_size: null,
    });
  }

  return models;
}

// ── Parse library page ────────────────────────────────────

function parseLibrary(html: string, model: OllamaModel): void {
  // Name from x-test-model-name
  const nameMatch = html.match(/x-test-model-name[^>]*>([^<]+)/i);
  if (nameMatch) model.name = nameMatch[1].trim();

  // Description from meta
  const metaMatch = html.match(
    /<meta\s+name="description"\s+content="([^"]+)"/i
  );
  if (metaMatch) model.description = metaMatch[1].trim();

  // Pulls from x-test-pull-count
  if (!model.pulls) {
    const pullMatch = html.match(/x-test-pull-count[^>]*>([^<]+)/i);
    if (pullMatch) {
      const raw = pullMatch[1].trim();
      model.pulls_text = raw;
      model.pulls = parsePulls(raw);
    }
  }

  // Updated from x-test-updated
  if (!model.updated) {
    const updMatch = html.match(/x-test-updated[^>]*>([^<]+)/i);
    if (updMatch) model.updated = updMatch[1].trim();
  }

  // Available parameter sizes from x-test-size spans
  const sizes: string[] = [];
  const sizePattern = /x-test-size[^>]*>([^<]+)/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sizePattern.exec(html)) !== null) {
    sizes.push(sm[1].trim().toLowerCase());
  }
  model.available_sizes = sizes;

  // Capabilities from colored badge spans
  const caps = new Set(model.capabilities);
  const chipPattern =
    /<span[^>]*class="[^"]*(?:bg-(?:indigo|blue|green|purple|pink|cyan|yellow|red|orange|emerald|teal)-\d+)[^"]*"[^>]*>([^<]+)<\/span>/gi;
  let cm: RegExpExecArray | null;
  while ((cm = chipPattern.exec(html)) !== null) {
    const txt = cm[1].trim().toLowerCase();
    if (CAPABILITY_KEYWORDS.has(txt)) caps.add(txt);
  }
  model.capabilities = [...caps].sort();
}

// ── Parse tags page ───────────────────────────────────────

function parseTags(html: string, model: OllamaModel): void {
  const variants: Variant[] = [];
  const seen = new Set<string>();

  // The tags page has two layouts:
  // Mobile: <a href="/library/slug:tag" class="md:hidden ..."> with inline text
  // Desktop: grid with col-span-2 <p> elements for size and context
  //
  // We parse the mobile layout since it has all info in a single block:
  // "6488c96fa5fa • 6.6GB • 256K context window • Text, Image input • 6 days ago"

  const escapedSlug = model.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Find each mobile tag link block
  const mobilePattern = new RegExp(
    `<a\\s+href="/library/${escapedSlug}:([^"]+)"\\s+class="md:hidden[^>]*>([\\s\\S]*?)</a>`,
    "gi"
  );
  let tm: RegExpExecArray | null;

  while ((tm = mobilePattern.exec(html)) !== null) {
    const tagName = tm[1];
    const fullTag = `${model.slug}:${tagName}`;
    if (seen.has(fullTag)) continue;
    seen.add(fullTag);

    const block = tm[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // Size (e.g., "6.6GB", "17GB")
    const sizeMatch = block.match(/([0-9]+(?:\.[0-9]+)?)\s*(KB|MB|GB|TB)/i);
    const sizeText = sizeMatch ? sizeMatch[0].trim() : null;
    const sizeBytes = sizeText ? parseSize(sizeText) : null;

    // Context length (e.g., "256K")
    const ctxMatch = block.match(/(\d+(?:\.\d+)?K)\s*context/i);
    const contextLen = ctxMatch ? ctxMatch[1] : null;

    // Input type (Text, Image, Vision, Audio)
    const inputTypes: string[] = [];
    const inputPattern = /\b(Text|Image|Vision|Audio)\b/gi;
    let im: RegExpExecArray | null;
    while ((im = inputPattern.exec(block)) !== null) {
      const t = im[1].charAt(0).toUpperCase() + im[1].slice(1).toLowerCase();
      if (!inputTypes.includes(t)) inputTypes.push(t);
    }
    const input = inputTypes.length > 0 ? inputTypes.join(", ") : null;

    // Parameters from tag name
    const paramMatch = tagName.match(/^([0-9]+(?:\.[0-9]+)?[bBtT])/);
    const params = paramMatch ? paramMatch[1].toLowerCase() : null;

    // Quantization from tag name
    let quantization: string | null = null;
    const quantMatch = tagName.match(
      /(q[0-9]+_[A-Za-z0-9_]+|bf16|fp16|f16|f32|int[48])/i
    );
    if (quantMatch) quantization = quantMatch[1].toLowerCase();

    variants.push({
      tag: fullTag,
      params,
      size_text: sizeText,
      size_bytes: sizeBytes,
      context: contextLen,
      input,
      quantization,
    });
  }

  // If mobile parsing failed, fall back to desktop grid parsing
  if (variants.length === 0) {
    const desktopPattern = new RegExp(
      `href="/library/${escapedSlug}:([^"]+)"[^>]*class="group-hover:underline"`,
      "gi"
    );
    while ((tm = desktopPattern.exec(html)) !== null) {
      const tagName = tm[1];
      const fullTag = `${model.slug}:${tagName}`;
      if (seen.has(fullTag)) continue;
      seen.add(fullTag);

      // Get surrounding context
      const start = Math.max(0, tm.index - 100);
      const end = Math.min(html.length, tm.index + 800);
      const ctx = html.slice(start, end).replace(/<[^>]+>/g, " ");

      const sizeMatch = ctx.match(/([0-9]+(?:\.[0-9]+)?)\s*(KB|MB|GB|TB)/i);
      const ctxMatch = ctx.match(/(\d+(?:\.\d+)?K)/);
      const paramMatch = tagName.match(/^([0-9]+(?:\.[0-9]+)?[bBtT])/);
      let quantization: string | null = null;
      const quantMatch = tagName.match(/(q[0-9]+_[A-Za-z0-9_]+|bf16|fp16|f16|f32|int[48])/i);
      if (quantMatch) quantization = quantMatch[1].toLowerCase();

      variants.push({
        tag: fullTag,
        params: paramMatch ? paramMatch[1].toLowerCase() : null,
        size_text: sizeMatch ? sizeMatch[0].trim() : null,
        size_bytes: sizeMatch ? parseSize(sizeMatch[0]) : null,
        context: ctxMatch ? ctxMatch[1] : null,
        input: null,
        quantization,
      });
    }
  }

  model.variants = variants;
  model.tags_count = variants.length || model.tags_count;

  // Extract default params/size from the "latest" or first variant
  const defaultVar =
    variants.find((v) => v.tag.endsWith(":latest")) || variants[0];
  if (defaultVar) {
    model.default_params = defaultVar.params;
    model.default_size = defaultVar.size_text;
  }

  // If no default_params from variants, use available_sizes from library page
  if (!model.default_params && model.available_sizes?.length) {
    model.default_params = model.available_sizes[0];
  }
}

// ── Scrape one model ──────────────────────────────────────

async function scrapeModel(model: OllamaModel): Promise<void> {
  try {
    const [libHtml, tagsHtml] = await Promise.all([
      fetchPage(`${BASE}/library/${model.slug}`),
      fetchPage(`${BASE}/library/${model.slug}/tags`),
    ]);
    parseLibrary(libHtml, model);
    parseTags(tagsHtml, model);
  } catch (e: any) {
    model.error = e.message;
  }
}

// ── Concurrent pool ───────────────────────────────────────

async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<void>
): Promise<void> {
  let idx = 0;
  const total = items.length;

  async function worker() {
    while (idx < total) {
      const i = idx++;
      await fn(items[i], i);
      await sleep(RATE_LIMIT_MS);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 0 : 0;
  const outIdx = args.indexOf("--out");
  const outPath = outIdx !== -1 ? args[outIdx + 1] : "out/ollama_models.json";

  console.log("🔍 Ultimate Ollama Scraper");
  console.log("=".repeat(60));

  // 1. Fetch all search pages using BOTH sorts to catch everything
  const slugMap = new Map<string, OllamaModel>();
  const sorts = ["popular", "newest"];

  for (const sort of sorts) {
    let page = 1;
    let emptyPages = 0;

    while (page <= MAX_PAGES && emptyPages < 2) {
      const sortParam = sort === "popular" ? "" : `&o=${sort}`;
      const url = `${BASE}/search?page=${page}${sortParam}`;

      process.stdout.write(
        `\r  Fetching [${sort}] page ${page}...                    `
      );

      try {
        const html = await fetchPage(url, { "HX-Request": "true" });
        const pageModels = parseSearchPage(html);

        if (pageModels.length === 0) {
          emptyPages++;
          page++;
          continue;
        }

        emptyPages = 0;
        for (const m of pageModels) {
          if (!slugMap.has(m.slug)) {
            slugMap.set(m.slug, m);
          }
        }

        if (limit && slugMap.size >= limit) break;
        page++;
      } catch (e: any) {
        console.error(`\n  Failed page ${page} [${sort}]: ${e.message}`);
        emptyPages++;
        page++;
      }

      await sleep(80);
    }

    if (limit && slugMap.size >= limit) break;
  }

  const allModels = [...slugMap.values()];
  if (limit) allModels.length = Math.min(allModels.length, limit);

  console.log(
    `\n\n  Discovered ${allModels.length} unique model slugs\n`
  );

  // 2. Scrape details for each model
  let done = 0;
  const errors: string[] = [];

  await pool(allModels, CONCURRENCY, async (model) => {
    await scrapeModel(model);
    done++;

    const status = model.error
      ? `ERR: ${model.error}`
      : `${model.tags_count || 0} tags`;
    const params = model.default_params || "?";
    const caps = model.capabilities.join(",") || "-";

    process.stdout.write(
      `\r  [${done}/${allModels.length}] ${model.slug.padEnd(30)} ${params.padEnd(8)} ${(model.pulls_text || "-").padEnd(10)} ${status.slice(0, 30)}`
    );

    if (model.error) errors.push(`${model.slug}: ${model.error}`);
  });

  console.log("\n");

  // 3. Sort by pulls descending
  allModels.sort((a, b) => (b.pulls || 0) - (a.pulls || 0));

  // 4. Write output
  const data: ScrapedData = {
    scraped_at: new Date().toISOString(),
    total_models: allModels.length,
    models: allModels,
  };

  const dir = dirname(outPath);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`  Wrote ${outPath} with ${allModels.length} models`);

  if (errors.length) {
    console.log(`\n  ${errors.length} errors:`);
    for (const e of errors) console.log(`    - ${e}`);
  }

  // 5. Print summary table
  console.log(
    `\n  ${"#".padStart(4)} ${"Slug".padEnd(32)} ${"Params".padEnd(10)} ${"Pulls".padStart(12)} ${"Size".padEnd(10)} ${"Capabilities".padEnd(30)} ${"Tags".padStart(5)}`
  );
  console.log("  " + "─".repeat(105));

  for (let i = 0; i < Math.min(40, allModels.length); i++) {
    const m = allModels[i];
    console.log(
      `  ${String(i + 1).padStart(4)} ${m.slug.padEnd(32)} ${(m.default_params || "?").padEnd(10)} ${(m.pulls_text || "-").padStart(12)} ${(m.default_size || "-").padEnd(10)} ${(m.capabilities.join(", ") || "-").padEnd(30)} ${String(m.tags_count || 0).padStart(5)}`
    );
  }

  // 6. Check for models missing from models.ts
  const modelsPath = join(import.meta.dir, "../src/data/models.ts");
  if (existsSync(modelsPath)) {
    const content = readFileSync(modelsPath, "utf-8");

    // Extract all ollamaId values from models.ts
    const ollamaIds = new Set<string>();
    const idPattern = /ollamaId:\s*["']([^"']+)["']/g;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = idPattern.exec(content)) !== null) {
      // Extract base slug (before the colon)
      const id = idMatch[1].split(":")[0];
      ollamaIds.add(id);
    }

    const missing = allModels.filter((m) => !ollamaIds.has(m.slug));
    const present = allModels.filter((m) => ollamaIds.has(m.slug));

    console.log(`\n  ━━━ Coverage Report ━━━`);
    console.log(
      `  In models.ts: ${present.length}/${allModels.length} (${Math.round((present.length / allModels.length) * 100)}%)`
    );
    console.log(`  Missing: ${missing.length} models\n`);

    if (missing.length > 0) {
      // Filter to only show interesting models (not embedding, not tiny)
      const interestingMissing = missing.filter(
        (m) =>
          !m.capabilities.includes("embedding") &&
          m.pulls !== null &&
          m.pulls > 500
      );

      const boringMissing = missing.filter(
        (m) =>
          m.capabilities.includes("embedding") ||
          m.pulls === null ||
          m.pulls <= 500
      );

      if (interestingMissing.length > 0) {
        console.log(
          `  🔴 ${interestingMissing.length} INTERESTING models missing (>500 pulls, not embedding):`
        );
        console.log(
          `  ${"Slug".padEnd(32)} ${"Pulls".padStart(12)} ${"Params".padEnd(10)} ${"Caps".padEnd(30)} ${"Blurb"}`
        );
        console.log("  " + "─".repeat(110));
        for (const m of interestingMissing) {
          console.log(
            `  ${m.slug.padEnd(32)} ${(m.pulls_text || "-").padStart(12)} ${(m.default_params || "?").padEnd(10)} ${(m.capabilities.join(", ") || "-").padEnd(30)} ${(m.blurb || "-").slice(0, 40)}`
          );
        }
      }

      if (boringMissing.length > 0) {
        console.log(
          `\n  ⚪ ${boringMissing.length} other missing (embedding or low pulls):`
        );
        for (const m of boringMissing.slice(0, 20)) {
          console.log(
            `     ${m.slug.padEnd(32)} ${(m.pulls_text || "-").padStart(12)} ${(m.capabilities.join(", ") || "-").padEnd(30)}`
          );
        }
      }
    }
  }

  console.log("\n  Done!");
}

main().catch(console.error);
