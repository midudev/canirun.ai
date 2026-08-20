import * as p from "@clack/prompts";
import { basename } from "node:path";
import { RUNAI_DEFAULT_PORT, RUNAI_VERSION } from "../config";
import { isApiServerActive, isPortInUse, stopApiServerOnPort } from "../process-manager";
import { isModelLoaded, getLoadedModelPath, unloadModel } from "../llamacpp";
import { getPromptOutput, usePromptLegend } from "../prompt-footer";
import { ANSI, paint, gradientBrand, pluralize } from "../terminal";
import { listInstalledModelOptions, stripGguf } from "../cli-utils";
import { checkForCliUpdate, type UpdateCheck } from "../update";

function homeIntro(installedCount: number, apiActive: boolean, portInUse: boolean): string {
  const apiLabel = apiActive
    ? paint(`• API ON :${RUNAI_DEFAULT_PORT}`, ANSI.green, true)
    : portInUse
      ? paint(`• PORT IN USE :${RUNAI_DEFAULT_PORT}`, ANSI.magenta, true)
      : paint(`• API OFF :${RUNAI_DEFAULT_PORT}`, ANSI.yellow, true);

  const loadedPath = getLoadedModelPath();
  const loadedLabel = loadedPath
    ? paint(`• ${stripGguf(loadedPath.split("/").pop()!)} loaded`, ANSI.green, true)
    : paint("• no model loaded", ANSI.gray, true);

  return [
    `${gradientBrand("runai")} ${paint(`v${RUNAI_VERSION}`, ANSI.gray, true)}`,
    `   ${paint("local-first AI runtime", ANSI.gray, true)}   ${paint(`• ${installedCount} ${pluralize(installedCount, "model", "models")} installed`, ANSI.cyan, true)}   ${apiLabel}   ${loadedLabel}`,
  ].join("\n");
}

function updateBanner(update: UpdateCheck): string | null {
  if (update.state !== "outdated") return null;
  return `Update available: v${update.current} → v${update.latest}. Run \`runai update\`.`;
}

export async function handleHome(): Promise<void> {
  const pendingUpdate = checkForCliUpdate();
  while (true) {
    const [installed, update] = await Promise.all([
      listInstalledModelOptions(),
      pendingUpdate,
    ]);
    const apiActive = await isApiServerActive();
    const portInUse = apiActive ? false : await isPortInUse();
    if (installed.length === 0) {
      const { handleRecommend } = await import("./recommend-install");
      const status = await handleRecommend([], {
        allowBackOnCancel: true,
        onboarding: true,
      });
      if (status === "cancelled") return;
      continue;
    }

    const loadedPath = getLoadedModelPath();
    const loadedName = loadedPath ? stripGguf(loadedPath.split("/").pop()!) : null;

    p.intro(homeIntro(installed.length, apiActive, portInUse));
    const banner = updateBanner(update);
    if (banner) p.log.warn(banner);
    usePromptLegend("list");
    const action = await p.select({
      message: "Choose an action:",
      output: getPromptOutput(),
      options: [
        ...(update.state === "outdated"
          ? [{
              value: "update",
              label: `⬆  Update runai ${paint(`v${update.current} → v${update.latest}`, ANSI.yellow, true)}`,
            }]
          : []),
        { value: "chat", label: "☻  Open an interactive chat session" },
        {
          value: "load",
          label: loadedName
            ? `⚡  Model in memory: ${paint(loadedName, ANSI.green, true)} ${paint("— change or unload", ANSI.gray, true)}`
            : "⚡  Load a model into memory",
        },
        { value: "install", label: "⚙︎  Install more models" },
        { value: "delete", label: "♻  Delete models" },
        {
          value: "api",
          label: apiActive
            ? `◼  Stop local OpenAI-compatible API ${paint(`(port ${RUNAI_DEFAULT_PORT})`, ANSI.gray, true)}`
            : `☁︎  Start local OpenAI-compatible API ${paint(`(port ${RUNAI_DEFAULT_PORT})`, ANSI.gray, true)}`,
        },
      ],
    });

    if (p.isCancel(action)) return;

    if (action === "update") {
      const { handleUpdate } = await import("./update");
      await handleUpdate(["--yes"]);
      return;
    }
    if (action === "chat") {
      const { handleChat } = await import("./chat");
      const chatOutcome = await handleChat([], { allowBackOnCancel: true });
      if (chatOutcome === "exit") return;
      continue;
    }
    if (action === "load") {
      usePromptLegend("list");
      const selected = await p.select({
        message: "Select a model to load into memory",
        output: getPromptOutput(),
        options: installed.map((item) => {
          const isLoaded = loadedPath === item.path;
          return {
            value: item.path,
            label: isLoaded
              ? `${item.name} ${paint("(loaded)", ANSI.green, true)}`
              : item.name,
            hint: isLoaded ? "currently in memory" : undefined,
          };
        }),
      });

      if (p.isCancel(selected)) continue;

      if (selected === loadedPath) {
        usePromptLegend("default");
        const shouldUnload = await p.confirm({
          message: `${stripGguf(basename(selected))} is already loaded. Unload it?`,
          output: getPromptOutput(),
        });
        if (!p.isCancel(shouldUnload) && shouldUnload) {
          await unloadModel();
          p.log.success("Model unloaded from memory.");
        }
        continue;
      }

      try {
        const { loadModelWithProgress } = await import("./model-lifecycle");
        await loadModelWithProgress(selected);
      } catch {
        // Error already logged by loadModelWithProgress
      }
      continue;
    }
    if (action === "install") {
      const { handleRecommend } = await import("./recommend-install");
      await handleRecommend([], { allowBackOnCancel: true });
      continue;
    }
    if (action === "delete") {
      const { handleDeleteModels } = await import("./simple");
      const status = await handleDeleteModels({ allowBackOnCancel: true });
      if (status === "completed") p.outro("Done.");
      continue;
    }
    if (action === "api") {
      if (apiActive) {
        const confirmStop = await p.confirm({
          message: `Stop local API on port ${RUNAI_DEFAULT_PORT}?`,
          initialValue: true,
          output: getPromptOutput(),
        });
        if (p.isCancel(confirmStop) || !confirmStop) continue;
        const stopped = await stopApiServerOnPort(RUNAI_DEFAULT_PORT);
        if (stopped) {
          p.log.success(`API stopped on port ${RUNAI_DEFAULT_PORT}`);
        } else {
          p.log.warn(`Could not stop process on port ${RUNAI_DEFAULT_PORT}`);
        }
        continue;
      }
      if (portInUse) {
        p.log.warn(`Port ${RUNAI_DEFAULT_PORT} is already in use by another process.`);
        p.log.info(`Use another port: runai api --port 11436`);
        continue;
      }
      const { handleDaemon } = await import("./daemon");
      await handleDaemon([]);
      continue;
    }
  }
}
