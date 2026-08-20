import { cpus, platform, totalmem } from "node:os";
import { RUNAI_HARDWARE_CACHE_TTL_MS } from "./config";
import type { CliHardwareInfo } from "./types";

let cachedHardware: CliHardwareInfo | null = null;
let cachedAt = 0;
let pendingDetection: Promise<CliHardwareInfo> | null = null;

async function detectHardwareFresh(): Promise<CliHardwareInfo> {
  const os = platform();

  if (os === "darwin") {
    const { detectMacHardware } = await import("./hardware-macos");
    return detectMacHardware();
  }

  if (os === "linux") {
    const { detectLinuxHardware } = await import("./hardware-linux");
    return detectLinuxHardware();
  }

  const totalMem = totalmem();
  const ramGB = Math.round((totalMem / (1024 ** 3)) * 10) / 10;
  const cpuList = cpus();
  const cpuName = cpuList[0]?.model?.trim() ?? null;

  return {
    gpuRenderer: null,
    gpuVendor: null,
    gpuCores: null,
    ramGB,
    estimatedVRAM: null,
    memoryBandwidth: Math.min(ramGB * 4, 100),
    systemRAM: ramGB,
    deviceMemoryRaw: null,
    webgpu: false,
    webgpuDevice: null,
    webgpuArch: null,
    isAppleSilicon: false,
    totalUsableRAM: ramGB,
    platform: os,
    cpuBenchmark: null,
    isMobile: false,
    deviceName: `${os} (${ramGB} GB RAM, unsupported platform)`,
    isWsl: false,
    cpuName,
    cpuCores: cpuList.length || null,
    computeBackend: "unknown",
  };
}

export async function detectHardware(
  options: { force?: boolean } = {},
): Promise<CliHardwareInfo> {
  const now = Date.now();
  if (!options.force && cachedHardware && now - cachedAt < RUNAI_HARDWARE_CACHE_TTL_MS) {
    return cachedHardware;
  }
  if (!options.force && pendingDetection) return pendingDetection;

  pendingDetection = detectHardwareFresh()
    .then((hardware) => {
      cachedHardware = hardware;
      cachedAt = Date.now();
      return hardware;
    })
    .finally(() => {
      pendingDetection = null;
    });
  return pendingDetection;
}
