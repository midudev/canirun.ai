import { cpus, release, totalmem } from "node:os";
import { matchGPU, parseVRAMFromName } from "@canirun/compatibility";
import type { CliHardwareInfo } from "./types";

export interface LinuxGpuInfo {
  name: string;
  vendor: "NVIDIA" | "AMD" | "Intel";
  vramMB: number | null;
  bandwidthGBs: number | null;
  backend: "cuda" | "rocm" | "vulkan";
  integrated: boolean;
}

function run(command: string, args: string[]): string {
  try {
    const result = Bun.spawnSync([command, ...args], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) return "";
    return new TextDecoder().decode(result.stdout).trim();
  } catch {
    return "";
  }
}

async function readFile(path: string): Promise<string> {
  try {
    return await Bun.file(path).text();
  } catch {
    return "";
  }
}

export function isWslEnvironment(
  versionText: string,
  kernelRelease: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return /microsoft|wsl/i.test(`${versionText}\n${kernelRelease}`)
    || Boolean(env.WSL_INTEROP || env.WSL_DISTRO_NAME);
}

export function parseMemTotalGB(meminfo: string): number | null {
  const match = meminfo.match(/^MemTotal:\s+(\d+)\s+kB/im);
  if (!match?.[1]) return null;
  return Math.round((Number.parseInt(match[1], 10) / (1024 * 1024)) * 10) / 10;
}

export function parseCpuName(cpuinfo: string): string | null {
  const patterns = [
    /^model name\s*:\s*(.+)$/im,
    /^Hardware\s*:\s*(.+)$/im,
    /^processor\s*:\s*(.+)$/im,
  ];
  for (const pattern of patterns) {
    const match = cpuinfo.match(pattern);
    const value = match?.[1]?.trim();
    if (value && !/^\d+$/.test(value)) return value;
  }
  return null;
}

function lookupBandwidth(name: string, vendor: LinuxGpuInfo["vendor"]): number | null {
  const catalogMatch = matchGPU(name);
  if (catalogMatch) return catalogMatch.bw;
  const nvidia: Record<string, number> = {
    "5090": 1792, "5080": 960, "5070 Ti": 896, "5070": 672,
    "4090": 1008, "4080 SUPER": 736, "4080": 717,
    "4070 Ti SUPER": 672, "4070 Ti": 504, "4070 SUPER": 504, "4070": 504,
    "4060 Ti": 288, "4060": 272, "3090 Ti": 1008, "3090": 936,
    "3080 Ti": 912, "3080": 760, "3070 Ti": 608, "3070": 448,
    "3060 Ti": 448, "3060": 360, "B200": 8000, "H200": 4800,
    "A100": 2039, "H100": 3350, "A10G": 600, "A10": 600,
    "A6000": 768, "L40": 864, "L20": 864,
  };
  const amd: Record<string, number> = {
    "7900 XTX": 960, "7900 XT": 800, "7900 GRE": 576, "7800 XT": 624,
    "7700 XT": 432, "6950 XT": 576, "6900 XT": 512, "6800 XT": 512,
    "6800": 512, "6700 XT": 384,
  };
  const table = vendor === "NVIDIA" ? nvidia : vendor === "AMD" ? amd : {};
  for (const [key, bandwidth] of Object.entries(table)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return bandwidth;
  }
  return null;
}

export function enrichLinuxGpu(
  gpu: Omit<LinuxGpuInfo, "vramMB" | "bandwidthGBs" | "backend">,
  detectedVramMB: number | null,
): LinuxGpuInfo {
  const catalogMatch = matchGPU(gpu.name);
  const catalogVramMB = catalogMatch?.vram
    ? Math.round(catalogMatch.vram * 1024)
    : null;
  const parsedVramGB = parseVRAMFromName(gpu.name);
  const parsedVramMB = parsedVramGB
    ? Math.round(parsedVramGB * 1024)
    : null;
  const integrated = gpu.integrated
    && !(catalogMatch && catalogMatch.vram > 0)
    && !/\bArc\s+[AB]\d|Arc\s+\w+M\b/i.test(gpu.name);
  return {
    ...gpu,
    integrated,
    vramMB: detectedVramMB ?? catalogVramMB ?? parsedVramMB,
    bandwidthGBs: catalogMatch?.bw ?? lookupBandwidth(gpu.name, gpu.vendor),
    backend: gpu.vendor === "AMD" && detectedVramMB ? "rocm" : "vulkan",
  };
}

export function parseNvidiaSmi(output: string): LinuxGpuInfo | null {
  const firstLine = output.split("\n").find(Boolean);
  if (!firstLine) return null;
  const parts = firstLine.split(",").map((part) => part.trim());
  const name = parts[0];
  const vramMB = Number.parseInt(parts[1] ?? "", 10);
  if (!name || !Number.isFinite(vramMB) || vramMB <= 0) return null;
  const enriched = enrichLinuxGpu({
    name,
    vendor: "NVIDIA",
    integrated: false,
  }, vramMB);
  return {
    ...enriched,
    bandwidthGBs: enriched.bandwidthGBs ?? 200,
    backend: "cuda",
  };
}

export function parseLspciGpu(output: string): Omit<LinuxGpuInfo, "vramMB" | "bandwidthGBs" | "backend"> | null {
  const candidates = output.split("\n").filter((line) => /\b(VGA compatible controller|3D controller|Display controller)\b/i.test(line));
  const line = candidates.find((value) => /\b(?:NVIDIA|AMD|ATI)\b/i.test(value)) ?? candidates[0];
  if (!line) return null;

  const vendor: LinuxGpuInfo["vendor"] = /\bNVIDIA\b/i.test(line)
    ? "NVIDIA"
    : /\b(?:AMD|ATI|Advanced Micro Devices)\b/i.test(line)
      ? "AMD"
      : "Intel";
  const name = line
    .replace(/^.*?\b(?:VGA compatible controller|3D controller|Display controller)\s*:\s*/i, "")
    .replace(/\s*\(rev [^)]+\)\s*$/i, "")
    .trim();
  return {
    name: name || `${vendor} GPU`,
    vendor,
    integrated: vendor === "Intel" || /\bintegrated\b|\bAPU\b/i.test(line),
  };
}

function detectNvidiaGpu(isWsl: boolean): LinuxGpuInfo | null {
  const args = ["--query-gpu=name,memory.total,pci.bus_id", "--format=csv,noheader,nounits"];
  const commands = isWsl
    ? ["nvidia-smi", "/usr/lib/wsl/lib/nvidia-smi"]
    : ["nvidia-smi"];
  for (const command of commands) {
    const gpu = parseNvidiaSmi(run(command, args));
    if (gpu) return gpu;
  }
  return null;
}

function detectAmdVramMB(): number | null {
  const output = run("rocm-smi", ["--showmeminfo", "vram", "--csv"]);
  if (!output) return null;
  for (const line of output.split("\n").slice(1)) {
    const values = line.match(/\d+/g)?.map(Number) ?? [];
    const bytes = Math.max(0, ...values.filter((value) => value > 1024 * 1024));
    if (bytes > 0) return Math.round(bytes / (1024 * 1024));
  }
  return null;
}

export async function detectLinuxHardware(): Promise<CliHardwareInfo> {
  const [meminfo, cpuinfo, versionText] = await Promise.all([
    readFile("/proc/meminfo"),
    readFile("/proc/cpuinfo"),
    readFile("/proc/version"),
  ]);

  const isWsl = isWslEnvironment(versionText, release());
  const ramGB = parseMemTotalGB(meminfo)
    ?? Math.round((totalmem() / (1024 ** 3)) * 10) / 10
    ?? null;
  const fallbackCpu = cpus()[0]?.model?.trim() || null;
  const cpuName = parseCpuName(cpuinfo) ?? fallbackCpu ?? "Unknown CPU";
  const cpuCores = Number.parseInt(run("nproc", []), 10) || cpus().length || 1;
  const lspciGpu = parseLspciGpu(run("lspci", ["-nn"]));

  let gpu = detectNvidiaGpu(isWsl);
  if (!gpu && lspciGpu) {
    const amdVramMB = lspciGpu.vendor === "AMD" ? detectAmdVramMB() : null;
    gpu = enrichLinuxGpu(lspciGpu, amdVramMB);
  }

  const vramGB = gpu?.vramMB ? Math.round((gpu.vramMB / 1024) * 10) / 10 : null;
  const sharedMemory = !gpu || gpu.integrated || vramGB === null;
  const bandwidth = gpu?.bandwidthGBs ?? (ramGB ? Math.min(ramGB * 4, 100) : 50);
  const platformName = isWsl ? "WSL" : "Linux";

  return {
    gpuRenderer: gpu?.name ?? null,
    gpuVendor: gpu?.vendor ?? null,
    gpuCores: gpu ? matchGPU(gpu.name)?.cores ?? null : null,
    ramGB,
    estimatedVRAM: vramGB,
    memoryBandwidth: bandwidth,
    systemRAM: ramGB,
    deviceMemoryRaw: vramGB ? vramGB * 1024 ** 3 : null,
    webgpu: false,
    webgpuDevice: null,
    webgpuArch: null,
    isAppleSilicon: false,
    totalUsableRAM: sharedMemory ? ramGB : Math.max(vramGB ?? 0, ramGB ?? 0),
    platform: platformName,
    cpuBenchmark: cpuCores * 8,
    isMobile: false,
    deviceName: gpu
      ? `${gpu.name}${vramGB ? ` (${vramGB} GB VRAM)` : gpu.integrated ? " (shared memory)" : " (VRAM unknown)"}`
      : `${cpuName} (CPU-only)`,
    isWsl,
    cpuName,
    cpuCores,
    computeBackend: gpu?.backend ?? "cpu",
  };
}
