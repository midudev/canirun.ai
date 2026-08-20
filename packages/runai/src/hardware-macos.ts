import { arch as osArch, cpus, totalmem } from "node:os";
import { CHIP_BW_GBS } from "./config";
import type { CliHardwareInfo } from "./types";

async function runAsync(command: string, args: string[]): Promise<string> {
  try {
    const proc = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return exitCode === 0 ? output.trim() : "";
  } catch {
    return "";
  }
}

export function parseAppleChip(value: string): string | null {
  const lower = value.toLowerCase();
  const candidates = Object.keys(CHIP_BW_GBS).sort((a, b) => b.length - a.length);
  return candidates.find((chip) => lower.includes(chip)) ?? null;
}

export function parseMacGpuProfile(systemProfile: string): {
  name: string | null;
  vendor: string | null;
  cores: number | null;
  vramGB: number | null;
} {
  const name = systemProfile.match(/Chipset Model:\s*(.+)/i)?.[1]?.trim() ?? null;
  const vendorRaw = systemProfile.match(/Vendor:\s*(.+)/i)?.[1]?.trim() ?? null;
  const coresRaw = systemProfile.match(/Total Number of Cores:\s*(\d+)/i)?.[1];
  const vramMatch = systemProfile.match(/VRAM(?: \([^)]+\))?:\s*([\d.]+)\s*(MB|GB)/i);
  let vramGB: number | null = null;
  if (vramMatch?.[1] && vramMatch[2]) {
    const amount = Number.parseFloat(vramMatch[1]);
    vramGB = Math.round((vramMatch[2].toUpperCase() === "MB" ? amount / 1024 : amount) * 10) / 10;
  }
  const vendor = vendorRaw?.replace(/\s*\(0x[0-9a-f]+\)\s*/i, "").trim()
    ?? (name?.match(/^(Apple|Intel|AMD|NVIDIA)/i)?.[1] ?? null);
  return {
    name,
    vendor,
    cores: coresRaw ? Number.parseInt(coresRaw, 10) : null,
    vramGB,
  };
}

export async function detectMacHardware(): Promise<CliHardwareInfo> {
  const [memBytes, cpuBrandRaw, cpuCoresRaw, gpuProfile, machineArch] = await Promise.all([
    runAsync("sysctl", ["-n", "hw.memsize"]),
    runAsync("sysctl", ["-n", "machdep.cpu.brand_string"]),
    runAsync("sysctl", ["-n", "hw.logicalcpu"]),
    runAsync("system_profiler", ["SPDisplaysDataType"]),
    runAsync("uname", ["-m"]),
  ]);

  const fallbackCpu = cpus()[0]?.model?.trim() || null;
  const cpuBrand = cpuBrandRaw || fallbackCpu;
  const chip = parseAppleChip(cpuBrand ?? "");
  const isAppleSilicon = machineArch === "arm64" || osArch() === "arm64" || chip !== null;
  const gpu = parseMacGpuProfile(gpuProfile);
  const totalRamGB = Math.round(
    ((Number(memBytes) || totalmem()) / (1024 ** 3)) * 10,
  ) / 10;
  const cpuCores = Number.parseInt(cpuCoresRaw, 10) || cpus().length || null;

  const appleDeviceName = chip ? `Apple ${chip.toUpperCase()}` : "Apple Silicon";
  const gpuName = gpu.name ?? (isAppleSilicon ? appleDeviceName : null);
  const gpuVendor = gpu.vendor ?? (isAppleSilicon ? "Apple" : null);
  const bandwidth = chip ? CHIP_BW_GBS[chip] ?? null : null;

  return {
    gpuRenderer: gpuName,
    gpuVendor,
    gpuCores: gpu.cores,
    ramGB: totalRamGB,
    estimatedVRAM: isAppleSilicon ? null : gpu.vramGB,
    memoryBandwidth: bandwidth,
    systemRAM: totalRamGB,
    deviceMemoryRaw: gpu.vramGB ? gpu.vramGB * 1024 ** 3 : null,
    webgpu: false,
    webgpuDevice: null,
    webgpuArch: chip,
    isAppleSilicon,
    totalUsableRAM: totalRamGB,
    platform: "macOS",
    cpuBenchmark: cpuCores ? cpuCores * (isAppleSilicon ? 10 : 8) : null,
    isMobile: false,
    deviceName: gpuName ?? cpuBrand ?? "Unknown Mac",
    isWsl: false,
    cpuName: cpuBrand,
    cpuCores,
    computeBackend: gpuName ? "metal" : "cpu",
  };
}
