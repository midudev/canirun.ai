import * as p from "@clack/prompts";
import { basename } from "node:path";
import { detectHardware } from "./hardware";
import { installCatalogModel, installHuggingFaceModel } from "./install";
import { pullModel } from "./pull";
import {
  findCatalogMatches,
  findModelByName,
  recommendTopModels,
  searchCatalog,
} from "./recommend";
import {
  getInstalledModelById,
  isModelFilePresent,
  upsertInstalledModel,
  type InstalledModelRecord,
} from "./db";
import {
  listInstalledModelOptions,
  normalizeModelId,
  stripGguf,
  uiFitScore,
} from "./cli-utils";
import { getPromptOutput, usePromptLegend } from "./prompt-footer";
import { ANSI, paint } from "./terminal";
import type { CliHardwareInfo, RecommendedModel } from "./types";

function isHttpUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

function catalogOptionLabel(item: RecommendedModel, index: number): string {
  const quant = paint(`[${item.quant}]`, ANSI.gray);
  const fit = uiFitScore(item.score);
  const installed = item.downloaded ? paint(" ✓ installed", ANSI.green, true) : "";
  const status = item.status === "cannot-run"
    ? paint("TOO LARGE", ANSI.gray, true)
    : item.status === "tight"
      ? paint("TIGHT FIT", ANSI.yellow, true)
      : item.status === "can-run-slow"
        ? paint("SLOW", ANSI.magenta, true)
        : paint("CAN RUN", ANSI.green, true);
  return [
    `${paint(String(index + 1), ANSI.bold)}. ${item.name} ${quant}${installed}`,
    `   ${paint("☆ Fit:", ANSI.magenta, true)} ${paint(`${fit}/100`, ANSI.green, true)}   ${status}`,
    `   ${paint("⛁ Disk:", ANSI.cyan, true)} ${paint(`${item.diskNeededGB} GB`, ANSI.cyan, true)}   ${paint("⚡", ANSI.yellow)} ${paint(`~${item.expectedTokensPerSec ?? "?"} tok/s`, ANSI.yellow)}`,
    "",
  ].join("\n");
}

async function confirmUnfitInstall(model: RecommendedModel): Promise<boolean> {
  if (model.status !== "cannot-run") return true;
  if (!process.stdin.isTTY) {
    throw new Error(
      `${model.name} looks too large for this machine. Pass a smaller model, or run this command in a terminal to confirm.`,
    );
  }
  usePromptLegend("default");
  const ok = await p.confirm({
    message: `${model.name} looks too large for this machine. Install the smallest available GGUF anyway?`,
    initialValue: false,
    output: getPromptOutput(),
  });
  return !p.isCancel(ok) && ok;
}

async function promptCatalogChoice(
  message: string,
  matches: RecommendedModel[],
): Promise<RecommendedModel | null> {
  if (!process.stdin.isTTY) return null;
  usePromptLegend("list");
  const selection = await p.select({
    message,
    output: getPromptOutput(),
    options: matches.map((item, index) => ({
      value: item.id,
      label: catalogOptionLabel(item, index),
    })),
  });
  if (p.isCancel(selection)) return null;
  return matches.find((item) => item.id === selection) ?? null;
}

export async function promptModelToInstall(
  hardware?: CliHardwareInfo,
): Promise<RecommendedModel | null> {
  if (!process.stdin.isTTY) return null;
  const hw = hardware ?? await detectHardware();
  const top = recommendTopModels(hw, 6);
  const rest = searchCatalog("", hw, 80).filter((item) => !top.some((best) => best.id === item.id));
  const catalog = [...top, ...rest];
  if (catalog.length === 0) {
    throw new Error("No compatible models were found for this machine.");
  }

  usePromptLegend("list");
  const selection = await p.autocomplete({
    message: "Search a model to install",
    placeholder: "qwen3.5-4b, gemma, llama...",
    maxItems: 10,
    output: getPromptOutput(),
    options: catalog.map((item) => ({
      value: item.id,
      label: `${item.name} ${paint(`[${item.quant}]`, ANSI.gray)}`,
      hint: `${uiFitScore(item.score)}/100 · ${item.diskNeededGB} GB · ~${item.expectedTokensPerSec ?? "?"} tok/s`,
    })),
  });
  if (p.isCancel(selection)) return null;
  return catalog.find((item) => item.id === selection)
    ?? findModelByName(selection, hw);
}

function notFoundError(request: string, hardware: CliHardwareInfo): Error {
  const suggestions = findCatalogMatches(request, hardware, 5)
    .map((item) => item.model.id);
  const fallback = suggestions.length > 0
    ? suggestions
    : searchCatalog(request, hardware, 5).map((item) => item.id);
  const hint = fallback.length > 0
    ? ` Did you mean: ${fallback.join(", ")}?`
    : " Try `runai browse` or pass a direct GGUF URL.";
  return new Error(`Model "${request}" was not found in the runai catalog.${hint}`);
}

async function resolveCatalogModel(
  request: string,
  hardware: CliHardwareInfo,
): Promise<RecommendedModel> {
  const exact = findModelByName(request, hardware);
  if (exact) return exact;

  const matches = findCatalogMatches(request, hardware, 12).map((item) => item.model);
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) throw notFoundError(request, hardware);

  const picked = await promptCatalogChoice(
    `${matches.length} models match "${request}" — choose one`,
    matches,
  );
  if (picked) return picked;

  throw new Error(
    `Multiple models match "${request}": ${matches.map((item) => item.id).join(", ")}. Use an exact model id.`,
  );
}

async function persistCatalogInstall(model: RecommendedModel): Promise<InstalledModelRecord> {
  if (!(await confirmUnfitInstall(model))) {
    throw new Error("Install cancelled.");
  }
  const result = await installCatalogModel(model);
  const record: InstalledModelRecord = {
    id: model.id,
    name: model.name,
    path: result.path,
    sourceUrl: result.sourceUrl,
    sourceRepo: result.sourceRepo,
    sourceFile: result.sourceFile,
    installedAt: new Date().toISOString(),
  };
  upsertInstalledModel(record);
  return record;
}

export async function installRequestedModel(
  request: string,
  explicitName?: string,
): Promise<InstalledModelRecord> {
  const value = request.trim();
  if (!value) throw new Error("A model name or GGUF URL is required.");

  if (isHttpUrl(value)) {
    const url = new URL(value);
    const isDirectGguf = url.pathname.toLowerCase().endsWith(".gguf")
      || url.pathname.includes("/resolve/");
    let path: string;
    let sourceRepo: string | null = null;
    let sourceFile: string | null = null;

    if (url.hostname === "huggingface.co" && !isDirectGguf) {
      const hardware = await detectHardware();
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) throw new Error(`Invalid Hugging Face model URL: ${value}`);
      const catalogModel = findModelByName(parts[1]!, hardware)
        ?? findModelByName(`${parts[0]}/${parts[1]}`, hardware);
      const fallbackId = normalizeModelId(explicitName || parts[1] || "model");
      const installed = catalogModel
        ? await persistCatalogInstall(catalogModel)
        : await (async () => {
            const downloaded = await installHuggingFaceModel(value, fallbackId);
            const record: InstalledModelRecord = {
              id: fallbackId,
              name: stripGguf(explicitName || parts[1] || fallbackId),
              path: downloaded.path,
              sourceUrl: downloaded.sourceUrl,
              sourceRepo: downloaded.sourceRepo,
              sourceFile: downloaded.sourceFile,
              installedAt: new Date().toISOString(),
            };
            upsertInstalledModel(record);
            return record;
          })();
      return installed;
    }

    path = await pullModel(value, explicitName);
    sourceFile = basename(path);

    const record: InstalledModelRecord = {
      id: normalizeModelId(explicitName || path),
      name: stripGguf(explicitName || basename(path)),
      path,
      sourceUrl: value,
      sourceRepo,
      sourceFile,
      installedAt: new Date().toISOString(),
    };
    upsertInstalledModel(record);
    return record;
  }

  const normalized = normalizeModelId(value);
  const byId = getInstalledModelById(normalized);
  if (byId && isModelFilePresent(byId.path)) return byId;

  const installed = await listInstalledModelOptions();
  const existing = installed.find((item) =>
    item.id.toLowerCase() === normalized
    || item.name.toLowerCase() === value.toLowerCase(),
  );
  if (existing) {
    const record = getInstalledModelById(existing.id);
    if (record) return record;
  }

  const hardware = await detectHardware();
  const model = await resolveCatalogModel(value, hardware);
  const already = getInstalledModelById(model.id);
  if (already && isModelFilePresent(already.path)) return already;
  return persistCatalogInstall(model);
}

export async function installModelInteractively(): Promise<InstalledModelRecord | null> {
  const hardware = await detectHardware();
  const selected = await promptModelToInstall(hardware);
  if (!selected) return null;
  const already = getInstalledModelById(selected.id);
  if (already && isModelFilePresent(already.path)) return already;
  return persistCatalogInstall(selected);
}
