import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { OLLAMA_MODEL_DIR } from "../config";
import { upsertInstalledModel } from "../db";
import { detectHardware } from "../hardware";
import { installCatalogModel } from "../install";
import { findModelByName } from "../recommend";
import { getPromptOutput, usePromptLegend } from "../prompt-footer";
import { hasFlag, listInstalledModelOptions } from "../cli-utils";
import type { RecommendedModel } from "../types";

interface OllamaModel {
  name: string;
  tag: string;
  ollamaId: string;
  equivalent: RecommendedModel | null;
}

interface ImportableOllamaModel extends OllamaModel {
  equivalent: RecommendedModel;
}

export async function handleImport(args: string[]): Promise<void> {
  const asJson = hasFlag(args, "--json");
  const ollamaDir = OLLAMA_MODEL_DIR;
  if (!existsSync(ollamaDir)) {
    p.log.error(`Ollama model directory not found at ${ollamaDir}`);
    p.log.info("Set OLLAMA_MODELS env var if your Ollama data is in a different location.");
    return;
  }

  const manifestsDir = join(ollamaDir, "manifests", "registry.ollama.ai", "library");
  if (!existsSync(manifestsDir)) {
    p.log.error("No Ollama manifests found. Have you pulled any models with Ollama?");
    return;
  }

  const hardware = await detectHardware();
  const foundModels: OllamaModel[] = [];

  try {
    const families = await readdir(manifestsDir, { withFileTypes: true });
    for (const family of families) {
      if (!family.isDirectory()) continue;
      const tagsDir = join(manifestsDir, family.name);
      const tags = await readdir(tagsDir, { withFileTypes: true });
      for (const tag of tags) {
        if (tag.isDirectory()) continue;
        const ollamaId = `${family.name}:${tag.name}`;
        foundModels.push({
          name: family.name,
          tag: tag.name,
          ollamaId,
          equivalent: findModelByName(ollamaId, hardware),
        });
      }
    }
  } catch (error) {
    p.log.error(`Failed to scan Ollama manifests: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const importable = foundModels.filter(
    (model): model is ImportableOllamaModel =>
      model.equivalent !== null,
  );

  if (asJson) {
    console.log(JSON.stringify({
      found: foundModels.map((model) => ({
        ollamaId: model.ollamaId,
        equivalent: model.equivalent?.id ?? null,
      })),
      importable: importable.length,
    }, null, 2));
    return;
  }

  if (importable.length === 0) {
    p.log.warn("No Ollama models have a downloadable GGUF equivalent in the runai catalog.");
    return;
  }

  p.intro(`runai import — ${importable.length} Ollama model(s) found`);

  const alreadyInstalled = await listInstalledModelOptions();
  const alreadyIds = new Set(alreadyInstalled.map((m) => m.id.toLowerCase()));
  const candidates = importable.filter((model) =>
    !alreadyIds.has(model.equivalent.id.toLowerCase()),
  );

  if (candidates.length === 0) {
    p.log.info("All matching Ollama models are already installed.");
    p.outro("Done.");
    return;
  }

  usePromptLegend("multiselect");
  const selected = await p.multiselect({
    message: "Select Ollama models to redownload as GGUF",
    required: false,
    withGuide: true,
    output: getPromptOutput(),
    options: candidates.map((model) => ({
      value: model,
      label: `${model.ollamaId} → ${model.equivalent.name} [${model.equivalent.quant}]`,
      hint: `${model.equivalent.diskNeededGB} GB download`,
    })),
  });

  if (p.isCancel(selected) || selected.length === 0) {
    p.log.info("No models selected.");
    return;
  }

  for (const model of selected) {
    const spinner = p.spinner();
    spinner.start(`Resolving ${model.ollamaId}...`);

    try {
      spinner.stop(`Downloading ${model.equivalent.name} from Hugging Face`);
      const installed = await installCatalogModel(model.equivalent);
      upsertInstalledModel({
        id: model.equivalent.id,
        name: model.equivalent.name,
        path: installed.path,
        sourceUrl: installed.sourceUrl,
        sourceRepo: installed.sourceRepo,
        sourceFile: installed.sourceFile,
      });
      p.log.success(`Installed ${model.equivalent.id}`);
    } catch (error) {
      spinner.stop(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  p.outro("Import complete.");
}
