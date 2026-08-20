import * as p from "@clack/prompts";
import { basename } from "node:path";
import { listInstalledModelPaths } from "./model-store";
import { getPromptOutput, usePromptLegend } from "./prompt-footer";
import { ANSI, paint } from "./terminal";

export interface InstalledModelOption {
  id: string;
  name: string;
  path: string;
}

export interface PromptNavigationOptions {
  allowBackOnCancel?: boolean;
  onboarding?: boolean;
}

export type ChatOutcome = "back" | "exit";

export function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const next = args[index + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

export function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

export function positionalArgs(args: string[], flagsWithValues: string[]): string[] {
  const needsValue = new Set(flagsWithValues);
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]!;
    if (token.startsWith("--")) {
      if (needsValue.has(token)) i += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

export function parseInstallTokens(input: string): string[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function stripGguf(fileName: string): string {
  return fileName.replace(/\.gguf$/i, "");
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countGeneratedTokens(
  thinking: string,
  answer: string,
  engineTokens = 0,
): number {
  return Math.max(engineTokens, estimateTokens(thinking) + estimateTokens(answer));
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

export function normalizeModelId(value: string): string {
  return stripGguf(basename(value)).trim().toLowerCase();
}

export function isLikelyProjectorModel(filePath: string): boolean {
  const normalized = basename(filePath).toLowerCase();
  const blockedTokens = ["mmproj", "clip", "projector", "vision"];
  return blockedTokens.some((token) => normalized.includes(token));
}

export function uiFitScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 0.72)));
}

export async function listInstalledModelOptions(): Promise<InstalledModelOption[]> {
  const { isModelFilePresent, listInstalledModels, removeInstalledModelById, upsertInstalledModel } = await import("./db");
  const dbModels = listInstalledModels();
  const options: InstalledModelOption[] = [];
  for (const record of dbModels) {
    if (!isModelFilePresent(record.path)) {
      removeInstalledModelById(record.id);
      continue;
    }
    options.push({ id: record.id, name: record.name, path: record.path });
  }
  if (options.length > 0) return options;

  const diskModels = await listInstalledModelPaths();
  for (const path of diskModels) {
    const id = normalizeModelId(path);
    upsertInstalledModel({
      id,
      name: stripGguf(basename(path)),
      path,
      sourceUrl: null,
      sourceRepo: null,
      sourceFile: null,
    });
    options.push({ id, name: stripGguf(basename(path)), path });
  }
  return options;
}

export async function resolveChatModel(args: string[], options: PromptNavigationOptions = {}): Promise<string | null> {
  const explicit = getArgValue(args, "--model");
  if (explicit) {
    if (explicit.includes("/") || explicit.endsWith(".gguf")) return explicit;
    const { getInstalledModelById, isModelFilePresent } = await import("./db");
    const installedById = getInstalledModelById(normalizeModelId(explicit));
    if (installedById && isModelFilePresent(installedById.path)) {
      return installedById.path;
    }
    return explicit;
  }

  const installed = await listInstalledModelOptions();
  if (installed.length === 0) {
    throw new Error("No installed models found. Install one first with `runai recommend` or `runai pull`.");
  }
  if (installed.length === 1) return installed[0]!.path;

  usePromptLegend("list");
  const selected = await p.select({
    message: "Choose installed model for chat",
    output: getPromptOutput(),
    options: installed.map((item) => ({
      value: item.path,
      label: `${item.name} (${item.id})`,
      hint: item.path,
    })),
  });
  if (p.isCancel(selected)) return null;
  return selected;
}

export async function resolveServeModel(args: string[]): Promise<string | undefined> {
  const explicit = getArgValue(args, "--model");
  if (explicit) return explicit;

  const installed = await listInstalledModelOptions();
  if (installed.length === 0) return undefined;
  if (!process.stdin.isTTY || installed.length === 1) return installed[0]!.path;

  usePromptLegend("list");
  const selected = await p.select({
    message: "Choose installed model for API server",
    output: getPromptOutput(),
    options: installed.map((item) => ({
      value: item.path,
      label: `${item.name} (${item.id})`,
      hint: item.path,
    })),
  });
  if (p.isCancel(selected)) return undefined;
  return selected;
}
