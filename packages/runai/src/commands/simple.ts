import * as p from "@clack/prompts";
import { stat, unlink } from "node:fs/promises";
import { basename } from "node:path";
import { RUNAI_DEFAULT_PORT } from "../config";
import { detectHardware } from "../hardware";
import { installCatalogModel } from "../install";
import { printBrowseResults } from "../output";
import { installModelInteractively, installRequestedModel } from "../model-request";
import { searchCatalog } from "../recommend";
import { sendBrowseTelemetry } from "../telemetry";
import { startServer } from "../serve";
import {
  getInstalledModelById,
  isModelFilePresent,
  removeInstalledModelByPath,
  upsertInstalledModel,
} from "../db";
import { getPromptOutput, usePromptLegend } from "../prompt-footer";
import { ANSI, paint } from "../terminal";
import {
  getArgValue, hasFlag, positionalArgs,
  listInstalledModelOptions, resolveServeModel, uiFitScore,
  type PromptNavigationOptions,
} from "../cli-utils";
import type { RecommendedModel } from "../types";

function coloredStatus(status: RecommendedModel["status"]): string {
  switch (status) {
    case "can-run": return paint("CAN RUN", ANSI.green, true);
    case "tight": return paint("TIGHT FIT", ANSI.yellow, true);
    case "can-run-slow": return paint("SLOW", ANSI.magenta, true);
    case "cannot-run": return paint("TOO LARGE", ANSI.gray, true);
    default: return paint("UNKNOWN", ANSI.gray, true);
  }
}

function browseOptionLabel(item: RecommendedModel, index: number): string {
  const quant = paint(`[${item.quant}]`, ANSI.gray);
  const fit = uiFitScore(item.score);
  const status = coloredStatus(item.status);
  const installed = item.downloaded ? paint(" ✓ installed", ANSI.green, true) : "";
  return [
    `${paint(String(index + 1), ANSI.bold)}. ${item.name} ${quant}`,
    `   ${paint("☆ Fit:", ANSI.magenta, true)} ${paint(`${fit}/100`, ANSI.green, true)}   ${status}${installed}`,
    `   ${paint("⛁", ANSI.cyan, true)} ${paint("Disk:", ANSI.cyan, true)} ${paint(`${item.diskNeededGB} GB`, ANSI.cyan, true)}   ${paint("⛃", ANSI.cyan, true)} ${paint("VRAM:", ANSI.cyan, true)} ${paint(`~${item.memoryNeededGB} GB`, ANSI.cyan, true)}`,
    `   ${paint("⚡Speed expected:", ANSI.yellow)} ~${item.expectedTokensPerSec ?? "?"} tok/s`,
    "",
  ].join("\n");
}

export async function handleBrowse(args: string[]): Promise<void> {
  const query = positionalArgs(args, ["--limit"]).join(" ");
  const limit = Number(getArgValue(args, "--limit") || "25");
  const hw = await detectHardware();
  const matches = searchCatalog(query, hw, limit);
  sendBrowseTelemetry(query, matches.length);

  if (hasFlag(args, "--json")) {
    console.log(JSON.stringify({ query, matches }, null, 2));
    return;
  }

  p.intro("runai browse");

  if (matches.length === 0) {
    p.log.warn("No models matched your search.");
    p.outro("0 model(s) shown");
    return;
  }

  if (!process.stdin.isTTY) {
    printBrowseResults(matches);
    p.outro(`${matches.length} model(s) shown`);
    return;
  }

  const selectMessage = query
    ? `${matches.length} results for "${query}" — select to install`
    : `${matches.length} models — select to install`;

  let visibleCount = Math.min(matches.length, 3);
  let selectedId: string | null = null;

  while (true) {
    const visible = matches.slice(0, visibleCount);
    const hasMore = visibleCount < matches.length;

    usePromptLegend("list");
    const selection = await p.select({
      message: selectMessage,
      output: getPromptOutput(),
      options: [
        ...visible.map((item, index) => ({
          value: item.id,
          label: browseOptionLabel(item, index),
        })),
        {
          value: "__more__",
          label: hasMore
            ? paint(`＋ Show more options (+3, ${matches.length - visibleCount} remaining)`, ANSI.yellow)
            : paint("＋ No more options", ANSI.gray),
          disabled: !hasMore,
        },
      ],
    });

    if (p.isCancel(selection)) {
      p.outro(`${matches.length} model(s) shown`);
      return;
    }

    if (selection === "__more__") {
      visibleCount = Math.min(visibleCount + 3, matches.length);
      continue;
    }

    selectedId = selection;
    break;
  }

  const model = matches.find((m) => m.id === selectedId);
  if (!model) return;

  if (model.downloaded) {
    const record = getInstalledModelById(model.id);
    if (record && isModelFilePresent(record.path)) {
      p.log.info(`${paint(model.name, ANSI.cyan)} is already installed.`);
      usePromptLegend("default");
      const openChat = await p.confirm({
        message: "Open chat?",
        output: getPromptOutput(),
      });
      if (!p.isCancel(openChat) && openChat) {
        const { handleChat } = await import("./chat");
        await handleChat(["--model", record.path]);
      }
      p.outro("Done.");
      return;
    }
  }

  p.log.step(`Installing ${model.name} [${model.quant}]...`);
  const installed = await installCatalogModel(model);
  upsertInstalledModel({
    id: model.id,
    name: model.name,
    path: installed.path,
    sourceUrl: installed.sourceUrl,
    sourceRepo: installed.sourceRepo,
    sourceFile: installed.sourceFile,
  });
  p.log.success(`Installed ${model.id}`);

  const { promptLoadAfterInstall } = await import("./model-lifecycle");
  const loaded = await promptLoadAfterInstall(installed.path);

  usePromptLegend("default");
  const openChat = await p.confirm({
    message: "Open chat?",
    output: getPromptOutput(),
  });
  if (!p.isCancel(openChat) && openChat) {
    const { handleChat } = await import("./chat");
    await handleChat(loaded ? ["--model", installed.path] : []);
  }
  p.outro("Done.");
}

export async function handlePull(args: string[]): Promise<void> {
  const request = positionalArgs(args, ["--name"]).join(" ");
  const name = getArgValue(args, "--name");
  const installed = request
    ? await installRequestedModel(request, name)
    : await installModelInteractively();
  if (!installed) {
    if (!request && !process.stdin.isTTY) {
      throw new Error("Usage: runai pull <model-or-gguf-url> [--name my-model.gguf]");
    }
    return;
  }
  p.log.success(`Ready: ${installed.name}`);

  const { promptLoadAfterInstall } = await import("./model-lifecycle");
  await promptLoadAfterInstall(installed.path);
}

export async function handleServe(args: string[]): Promise<boolean> {
  const model = await resolveServeModel(args);
  if (!model) {
    p.log.error("No model selected. Install one with `runai recommend` or pass `--model`.");
    return false;
  }
  const port = Number(getArgValue(args, "--port") || `${RUNAI_DEFAULT_PORT}`) || RUNAI_DEFAULT_PORT;
  try {
    startServer({ model, port });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("EADDRINUSE") || message.toLowerCase().includes("port")) {
      p.log.error(`Port ${port} is already in use. Try --port ${port + 1}`);
      return false;
    }
    p.log.error(`Failed to start API server: ${message}`);
    return false;
  }
}

export async function handleList(args: string[]): Promise<void> {
  const asJson = hasFlag(args, "--json");
  const installed = await listInstalledModelOptions();

  if (installed.length === 0) {
    if (asJson) {
      console.log(JSON.stringify({ models: [] }, null, 2));
    } else {
      p.log.warn("No installed models. Run `runai run <model>` to install one.");
    }
    return;
  }

  if (asJson) {
    const models = [];
    for (const item of installed) {
      const fileStat = await stat(item.path).catch(() => null);
      models.push({
        id: item.id,
        name: item.name,
        path: item.path,
        sizeBytes: fileStat?.size ?? 0,
      });
    }
    console.log(JSON.stringify({ models }, null, 2));
    return;
  }

  p.intro(`runai list — ${installed.length} model(s)`);
  for (const item of installed) {
    const fileStat = await stat(item.path).catch(() => null);
    const sizeGB = fileStat ? Math.round((fileStat.size / (1024 ** 3)) * 100) / 100 : 0;
    p.log.message(
      `${paint(item.name, ANSI.cyan)} ${paint(`(${item.id})`, ANSI.gray, true)}   ${paint(`${sizeGB} GB`, ANSI.yellow)}`,
      { symbol: "•" },
    );
  }
  p.outro("Done.");
}

export async function handleDeleteModels(
  options: PromptNavigationOptions = {},
): Promise<"completed" | "cancelled"> {
  const installed = await listInstalledModelOptions();
  if (installed.length === 0) {
    p.log.warn("No installed models to delete.");
    return "completed";
  }

  usePromptLegend("multiselect");
  const selected = await p.multiselect({
    message: "Select models to delete",
    required: false,
    withGuide: true,
    output: getPromptOutput(),
    options: installed.map((item) => ({
      value: item.path,
      label: `${item.name} (${item.id})`,
      hint: item.path,
    })),
  });

  if (p.isCancel(selected)) return "cancelled";
  if (selected.length === 0) {
    p.log.info("No models selected.");
    return "completed";
  }

  usePromptLegend("default");
  const ok = await p.confirm({
    message: `Delete ${selected.length} model(s)? This action cannot be undone.`,
    initialValue: false,
    output: getPromptOutput(),
  });
  if (p.isCancel(ok)) return "cancelled";
  if (!ok) {
    p.log.info("Delete cancelled.");
    return "completed";
  }

  for (const modelPath of selected) {
    await unlink(modelPath);
    removeInstalledModelByPath(modelPath);
    p.log.success(`Deleted ${basename(modelPath)}`);
  }
  return "completed";
}
