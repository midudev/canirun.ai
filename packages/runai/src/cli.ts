#!/usr/bin/env bun

function setupHardExitOnCtrlC(): void {
  let exiting = false;
  const hardExit = (): void => {
    if (exiting) return;
    exiting = true;
    process.stdout.write("\n");
    process.exit(130);
  };

  process.on("SIGINT", hardExit);
  if (process.stdin.isTTY) {
    process.stdin.on("data", (chunk: string | Buffer) => {
      if (typeof chunk !== "string" && chunk.length === 1 && chunk[0] === 0x03) {
        hardExit();
      }
    });
    process.stdin.unref();
  }
}

function printHelp(): void {
  console.log(`
runai - local AI runtime (Bun + llama.cpp)

Usage:
  runai                                  Interactive home menu
  runai run [model-or-url]               Download if needed, then open chat
  runai pull [model-or-url]              Download the best compatible GGUF
  runai serve [--detach]                 Start the local OpenAI-compatible API
  runai list                             List installed models
  runai ps                               Show the model currently in memory
  runai stop                             Stop the background API
  runai doctor                           Diagnose this installation
  runai update                           Update the CLI to the latest version

Discover:
  runai recommend [--top N] [--json]     Hardware-aware recommendations
  runai browse [query] [--limit N]       Search model catalog

Advanced:
  runai chat [--model <path-or-id>]      Open interactive chat
  runai pull <url> [--name ...]          Save a direct GGUF URL with a custom name
  runai show [model] [--json]            Show model metadata & info
  runai bench [--model <path-or-id>]     Benchmark a model (tok/s, TTFT)
  runai load [model]                     Pre-load a model into memory
  runai unload                           Unload model from memory
  runai import [--json]                  Find GGUF equivalents for Ollama models
  runai list|doctor --json                Machine-readable diagnostics
  runai update --check [--json]          Check for a newer CLI without installing
  runai --help | --version

API endpoints:
  POST /v1/chat/completions     Chat completions (OpenAI-compatible)
  POST /v1/completions          Text completions
  POST /v1/embeddings           Generate embeddings
  GET  /v1/models               List available models

Environment:
  RUNAI_MODEL_DIR         Model storage directory (~/.runai/models)
  RUNAI_PORT              API server port (11435)
  RUNAI_MODEL             Default model for API
  RUNAI_KEEP_ALIVE        Idle model unload time in seconds (300)
  RUNAI_MAX_QUEUE         Max queued requests (64)
  RUNAI_MAX_TOKENS        Default max tokens (2048)
  RUNAI_CONTEXT_SIZE      Max inference context tokens (4096)
  RUNAI_HARDWARE_CACHE_TTL  Hardware cache time in seconds (30)
  RUNAI_TELEMETRY_DISABLED=1  Disable anonymous telemetry
  RUNAI_UPDATE_CHECK=0    Disable background CLI update checks
  OLLAMA_MODELS           Ollama model dir for import (~/.ollama/models)
`);
}

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv;

  if (!cmd) {
    const { handleHome } = await import("./commands/home");
    await handleHome();
    return;
  }

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return;
  }
  if (cmd === "--version" || cmd === "-v") {
    const { RUNAI_VERSION } = await import("./config");
    console.log(`runai ${RUNAI_VERSION}`);
    return;
  }

  if (cmd === "run") {
    const { handleRun } = await import("./commands/run");
    await handleRun(args);
    return;
  }
  if (cmd === "recommend") {
    const { handleRecommend } = await import("./commands/recommend-install");
    await handleRecommend(args);
    return;
  }
  if (cmd === "browse") {
    const { handleBrowse } = await import("./commands/simple");
    await handleBrowse(args);
    return;
  }
  if (cmd === "pull") {
    const { handlePull } = await import("./commands/simple");
    await handlePull(args);
    return;
  }
  if (cmd === "serve" || cmd === "api") {
    if (args.includes("--detach") || args.includes("-d")) {
      const { handleDaemon } = await import("./commands/daemon");
      await handleDaemon(args.filter((a) => a !== "--detach" && a !== "-d"));
      return;
    }
    const { handleServe } = await import("./commands/simple");
    await handleServe(args);
    return;
  }
  if (cmd === "chat") {
    const { handleChat } = await import("./commands/chat");
    await handleChat(args);
    return;
  }
  if (cmd === "list" || cmd === "ls") {
    const { handleList } = await import("./commands/simple");
    await handleList(args);
    return;
  }
  if (cmd === "show" || cmd === "info") {
    const { handleShow } = await import("./commands/show");
    await handleShow(args);
    return;
  }
  if (cmd === "bench" || cmd === "benchmark") {
    const { handleBench } = await import("./commands/bench");
    await handleBench(args);
    return;
  }
  if (cmd === "import") {
    const { handleImport } = await import("./commands/import-ollama");
    await handleImport(args);
    return;
  }
  if (cmd === "load") {
    const { handleLoad } = await import("./commands/model-lifecycle");
    await handleLoad(args);
    return;
  }
  if (cmd === "unload") {
    const { handleUnload } = await import("./commands/model-lifecycle");
    await handleUnload();
    return;
  }
  if (cmd === "ps") {
    const { handlePs } = await import("./commands/model-lifecycle");
    await handlePs();
    return;
  }
  if (cmd === "stop") {
    const { handleStop } = await import("./commands/daemon");
    await handleStop();
    return;
  }
  if (cmd === "doctor") {
    const { handleDoctor } = await import("./commands/doctor");
    await handleDoctor(args);
    return;
  }
  if (cmd === "update" || cmd === "upgrade") {
    const { handleUpdate } = await import("./commands/update");
    await handleUpdate(args);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

setupHardExitOnCtrlC();
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
