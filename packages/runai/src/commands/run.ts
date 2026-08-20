import * as p from "@clack/prompts";
import { getArgValue, positionalArgs } from "../cli-utils";
import { installModelInteractively, installRequestedModel } from "../model-request";
import { handleChat } from "./chat";

export async function handleRun(args: string[]): Promise<void> {
  const modelName = positionalArgs(args, ["--model"]).join(" ") || getArgValue(args, "--model");

  try {
    const installed = modelName
      ? await installRequestedModel(modelName)
      : await installModelInteractively();
    if (!installed) {
      if (!modelName && !process.stdin.isTTY) {
        p.log.error("Usage: runai run <model-name>\n  Example: runai run qwen3.5-4b");
      }
      return;
    }
    p.log.success(`Ready: ${installed.name}`);
    await handleChat(["--model", installed.path]);
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : String(error));
    p.log.info("Try `runai browse`, or pass a direct GGUF URL.");
  }
}
