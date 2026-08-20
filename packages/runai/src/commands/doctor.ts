import * as p from "@clack/prompts";
import { constants } from "node:fs";
import { access, stat, statfs } from "node:fs/promises";
import { arch, platform } from "node:os";
import { basename, join } from "node:path";
import { getArgValue, hasFlag, isLikelyProjectorModel } from "../cli-utils";
import { RUNAI_MODEL_DIR, RUNAI_VERSION } from "../config";
import { detectHardware } from "../hardware";
import { ensureModelDir, listInstalledModelPaths } from "../model-store";
import type { CliHardwareInfo } from "../types";
import { checkForCliUpdate } from "../update";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  fix?: string;
}

function formatGB(bytes: number): string {
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

function getBackendDetail(llama: unknown, hardware: CliHardwareInfo): {
  backend: string;
  supportsGpuOffloading: boolean | null;
} {
  const runtime = llama as Record<string, unknown>;
  const rawGpu = runtime.gpu;
  const backend = typeof rawGpu === "string" && rawGpu
    ? rawGpu
    : hardware.computeBackend ?? "unknown";
  const support = runtime.supportsGpuOffloading;
  return {
    backend,
    supportsGpuOffloading: typeof support === "boolean" ? support : null,
  };
}

function addHardwareChecks(checks: DoctorCheck[], hardware: CliHardwareInfo): void {
  checks.push({
    name: "hardware",
    status: "ok",
    detail: `${hardware.cpuName ?? "Unknown CPU"}; ${hardware.deviceName ?? "no accelerator detected"}; ${hardware.ramGB ?? "?"} GB RAM`,
  });

  if (hardware.isWsl) {
    checks.push({
      name: "wsl",
      status: hardware.gpuVendor === "NVIDIA" ? "ok" : "warn",
      detail: hardware.gpuVendor === "NVIDIA"
        ? `WSL with NVIDIA GPU passthrough (${hardware.gpuRenderer})`
        : "WSL detected without NVIDIA GPU passthrough",
      fix: hardware.gpuVendor === "NVIDIA"
        ? undefined
        : "Install a current NVIDIA Windows host driver with WSL support, run `wsl --update` in Windows, restart WSL, then verify `nvidia-smi` inside WSL.",
    });
  }

  if (hardware.gpuRenderer) {
    checks.push({
      name: "gpu",
      status: "ok",
      detail: `${hardware.gpuVendor ?? "Unknown vendor"} ${hardware.gpuRenderer}; expected backend ${hardware.computeBackend ?? "unknown"}${hardware.estimatedVRAM ? `; ${hardware.estimatedVRAM} GB VRAM` : "; shared/unknown VRAM"}`,
    });
  } else {
    checks.push({
      name: "gpu",
      status: "warn",
      detail: "No supported GPU accelerator detected; inference will use CPU",
      fix: hardware.platform === "Linux" || hardware.platform === "WSL"
        ? "Install the GPU driver and `pciutils`; verify the device with `lspci` and the vendor tool (`nvidia-smi` or `rocm-smi`)."
        : "CPU inference is available, but use a supported Metal-capable Mac for GPU acceleration.",
    });
  }
}

export async function handleDoctor(args: string[]): Promise<void> {
  const asJson = hasFlag(args, "--json");
  const explicitModel = getArgValue(args, "--model");
  const checks: DoctorCheck[] = [];
  const currentPlatform = platform();
  const supportedPlatform = currentPlatform === "darwin" || currentPlatform === "linux";

  const update = await checkForCliUpdate();
  if (update.state === "outdated") {
    checks.push({
      name: "cli-version",
      status: "warn",
      detail: `runai ${update.current}; latest is ${update.latest}`,
      fix: "Run `runai update` to install the latest CLI.",
    });
  } else if (update.state === "current") {
    checks.push({
      name: "cli-version",
      status: "ok",
      detail: `runai ${update.latest} (up to date)`,
    });
  } else {
    checks.push({
      name: "cli-version",
      status: "ok",
      detail: `runai ${RUNAI_VERSION} (latest version could not be checked)`,
    });
  }

  checks.push({
    name: "runtime",
    status: typeof Bun !== "undefined" ? "ok" : "fail",
    detail: typeof Bun !== "undefined" ? `bun ${Bun.version}` : "Bun runtime unavailable",
    fix: typeof Bun !== "undefined" ? undefined : "Install Bun and re-run runai.",
  });
  checks.push({
    name: "platform",
    status: supportedPlatform ? "ok" : "fail",
    detail: `${currentPlatform} ${arch()}`,
    fix: supportedPlatform ? undefined : "Use runai on macOS, Linux, or WSL. Native Windows is not currently supported.",
  });

  let hardware: CliHardwareInfo | null = null;
  if (supportedPlatform) {
    try {
      hardware = await detectHardware({ force: true });
      addHardwareChecks(checks, hardware);
    } catch (error) {
      checks.push({
        name: "hardware",
        status: "warn",
        detail: error instanceof Error ? error.message : "hardware detection failed",
        fix: "Verify system tools are available (`sysctl`/`system_profiler` on macOS, `/proc` and `lspci` on Linux).",
      });
    }
  }

  let modelDir: string | null = null;
  try {
    modelDir = await ensureModelDir();
    checks.push({ name: "model-dir", status: "ok", detail: modelDir });
    try {
      await access(modelDir, constants.R_OK | constants.W_OK | constants.X_OK);
      checks.push({ name: "model-permissions", status: "ok", detail: "read, write, and directory traversal allowed" });
    } catch (error) {
      checks.push({
        name: "model-permissions",
        status: "fail",
        detail: error instanceof Error ? error.message : "model directory is not readable and writable",
        fix: `Grant the current user read/write access or set RUNAI_MODEL_DIR to a writable directory (current: ${modelDir}).`,
      });
    }

    try {
      const filesystem = await statfs(modelDir);
      const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
      checks.push({
        name: "disk-space",
        status: availableBytes < 1024 ** 3 ? "fail" : availableBytes < 10 * 1024 ** 3 ? "warn" : "ok",
        detail: `${formatGB(availableBytes)} available in ${modelDir}`,
        fix: availableBytes < 10 * 1024 ** 3
          ? "Free disk space or move RUNAI_MODEL_DIR to a volume with at least 10 GB available."
          : undefined,
      });
    } catch (error) {
      checks.push({
        name: "disk-space",
        status: "warn",
        detail: error instanceof Error ? error.message : "free space could not be determined",
        fix: `Check free space manually for ${modelDir}.`,
      });
    }
  } catch (error) {
    checks.push({
      name: "model-dir",
      status: "fail",
      detail: error instanceof Error ? error.message : "Cannot create model directory",
      fix: `Set RUNAI_MODEL_DIR to a writable directory (current: ${RUNAI_MODEL_DIR}).`,
    });
  }

  const runtimeSpinner = asJson ? null : p.spinner();
  runtimeSpinner?.start("Checking node-llama-cpp runtime...");
  try {
    const module = await import("node-llama-cpp");
    if (typeof module.getLlama !== "function") {
      throw new Error("node-llama-cpp loaded but getLlama() was not found");
    }
    const llama = await module.getLlama();
    runtimeSpinner?.stop("node-llama-cpp is ready");
    checks.push({ name: "node-llama-cpp", status: "ok", detail: "native bindings loaded successfully" });

    if (hardware) {
      const backend = getBackendDetail(llama, hardware);
      const expectsGpu = hardware.computeBackend !== "cpu" && hardware.computeBackend !== "unknown";
      const hasGpuOffload = backend.supportsGpuOffloading !== false;
      checks.push({
        name: "backend",
        status: expectsGpu && !hasGpuOffload ? "warn" : "ok",
        detail: `${backend.backend}; GPU offloading ${backend.supportsGpuOffloading === null ? "not reported" : backend.supportsGpuOffloading ? "available" : "unavailable"}`,
        fix: expectsGpu && !hasGpuOffload
          ? hardware.isWsl
            ? "Fix WSL GPU passthrough, then reinstall node-llama-cpp so its CUDA backend is available."
            : "Install the matching GPU driver/toolchain and reinstall node-llama-cpp to enable GPU offloading."
          : undefined,
      });
    }
  } catch (error) {
    runtimeSpinner?.stop("node-llama-cpp check failed");
    checks.push({
      name: "node-llama-cpp",
      status: "fail",
      detail: error instanceof Error ? error.message : "runtime init failed",
      fix: "Run `pnpm approve-builds node-llama-cpp` and then `pnpm install`.",
    });
  }

  let installed: string[] = [];
  try {
    installed = await listInstalledModelPaths();
    const sizes = await Promise.all(installed.map(async (file) => (await stat(file)).size));
    const totalBytes = sizes.reduce((total, size) => total + size, 0);
    checks.push({
      name: "installed-models",
      status: installed.length > 0 ? "ok" : "warn",
      detail: `${installed.length} model(s) found${installed.length ? ` (${formatGB(totalBytes)} total)` : ""}`,
      fix: installed.length > 0 ? undefined : "Install a model with `runai run qwen3.5-4b` or search one with `runai run`.",
    });
  } catch (error) {
    checks.push({
      name: "installed-models",
      status: "fail",
      detail: error instanceof Error ? error.message : "installed models could not be listed",
      fix: modelDir ? `Check permissions and GGUF files in ${modelDir}.` : "Fix the model directory first.",
    });
  }

  const suspiciousByName = installed.filter(isLikelyProjectorModel);
  if (suspiciousByName.length > 0) {
    checks.push({
      name: "model-filenames",
      status: "warn",
      detail: `${suspiciousByName.length} possible mmproj/CLIP file(s): ${suspiciousByName.map((file) => basename(file)).join(", ")}`,
      fix: "Delete these files and reinstall text GGUF models with `runai recommend`.",
    });
  } else if (installed.length > 0) {
    checks.push({ name: "model-filenames", status: "ok", detail: "no obvious mmproj/CLIP file names detected" });
  }

  if (installed.length > 0) {
    try {
      const { readGgufFileInfo } = await import("node-llama-cpp");
      const clipModels: string[] = [];
      for (const filePath of installed.slice(0, 12)) {
        const info = await readGgufFileInfo(filePath, { readTensorInfo: false, logWarnings: false });
        const archName = String(info.metadata.general.architecture || "").toLowerCase();
        if (archName === "clip") clipModels.push(basename(filePath));
      }
      checks.push(clipModels.length > 0
        ? {
            name: "model-architecture",
            status: "warn",
            detail: `${clipModels.length} installed model(s) are CLIP/mmproj: ${clipModels.join(", ")}`,
            fix: "Delete these files and install a text chat GGUF model with `runai recommend`.",
          }
        : { name: "model-architecture", status: "ok", detail: "inspected GGUF architectures look valid" });
    } catch (error) {
      checks.push({
        name: "model-architecture",
        status: "warn",
        detail: error instanceof Error ? error.message : "unable to inspect GGUF metadata",
        fix: "Run `runai doctor --model /path/to/model.gguf` to inspect a specific model.",
      });
    }
  }

  if (explicitModel) {
    try {
      const target = explicitModel.includes("/") || explicitModel.includes("\\")
        ? explicitModel
        : join(RUNAI_MODEL_DIR, explicitModel);
      const modelInfo = await stat(target);
      let architecture: string | null = null;
      try {
        const { readGgufFileInfo } = await import("node-llama-cpp");
        const info = await readGgufFileInfo(target, { readTensorInfo: false, logWarnings: false });
        architecture = String(info.metadata.general.architecture || "").toLowerCase();
      } catch {
        architecture = null;
      }
      const invalid = architecture === "clip" || isLikelyProjectorModel(target);
      checks.push({
        name: "model-check",
        status: invalid ? "warn" : "ok",
        detail: `${basename(target)} (${formatGB(modelInfo.size)})${architecture ? ` [arch=${architecture}]` : ""}`,
        fix: invalid ? "This is a projector file (CLIP/mmproj). Use a chat/instruct GGUF main model." : undefined,
      });
    } catch (error) {
      checks.push({
        name: "model-check",
        status: "fail",
        detail: error instanceof Error ? error.message : "cannot inspect model file",
        fix: "Pass an existing file path with `--model` or install the model first.",
      });
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ checks }, null, 2));
    return;
  }

  p.intro("runai doctor");
  for (const check of checks) {
    const prefix = check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "✗";
    const logFn = check.status === "ok" ? p.log.success : check.status === "warn" ? p.log.warn : p.log.error;
    logFn(`${prefix} ${check.name}: ${check.detail}`);
    if (check.fix) p.log.info(`   fix: ${check.fix}`);
  }

  if (checks.some((check) => check.status === "fail")) {
    p.outro("Doctor found blocking issues.");
  } else if (checks.some((check) => check.status === "warn")) {
    p.outro("Doctor finished with warnings.");
  } else {
    p.outro("Doctor says your setup looks healthy.");
  }
}
