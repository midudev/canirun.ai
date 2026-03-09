// ── Types ──────────────────────────────────────────────────

export interface HardwareInfo {
  cpuCores: number | null;
  ramGB: number | null;
  gpuRenderer: string | null;
  gpuVendor: string | null;
  estimatedVRAM: number | null;
  webgpu: boolean;
  webgpuDevice: string | null;
  webgpuArch: string | null;
  isAppleSilicon: boolean;
  totalUsableRAM: number | null;
  memoryBandwidth: number | null;
  platform: string | null;
  cpuBenchmark: number | null;
  isMobile: boolean;
  deviceName: string | null;
}

export type ModelStatus = "can-run" | "tight" | "cannot-run" | "unknown";
export type Grade = "S" | "A" | "B" | "C" | "D" | "F" | "?";

export interface GradeInfo {
  letter: string;
  label: string;
  color: string;
}

// ── GPU Database ───────────────────────────────────────────

const GPU_DB: Record<string, { vram: number; bw: number }> = {
  "RTX 4090": { vram: 24, bw: 1008 },
  "RTX 4080 SUPER": { vram: 16, bw: 736 },
  "RTX 4080": { vram: 16, bw: 717 },
  "RTX 4070 Ti SUPER": { vram: 16, bw: 672 },
  "RTX 4070 Ti": { vram: 12, bw: 504 },
  "RTX 4070 SUPER": { vram: 12, bw: 504 },
  "RTX 4070": { vram: 12, bw: 504 },
  "RTX 4060 Ti 16GB": { vram: 16, bw: 288 },
  "RTX 4060 Ti": { vram: 8, bw: 288 },
  "RTX 4060": { vram: 8, bw: 272 },
  "RTX 3090 Ti": { vram: 24, bw: 1008 },
  "RTX 3090": { vram: 24, bw: 936 },
  "RTX 3080 Ti": { vram: 12, bw: 912 },
  "RTX 3080": { vram: 10, bw: 760 },
  "RTX 3070 Ti": { vram: 8, bw: 608 },
  "RTX 3070": { vram: 8, bw: 448 },
  "RTX 3060 Ti": { vram: 8, bw: 448 },
  "RTX 3060": { vram: 12, bw: 360 },
  "RTX 3050": { vram: 8, bw: 224 },
  "RTX 5090": { vram: 32, bw: 1792 },
  "RTX 5080": { vram: 16, bw: 960 },
  "RTX 5070 Ti": { vram: 16, bw: 896 },
  "RTX 5070": { vram: 12, bw: 672 },
  "RTX A6000": { vram: 48, bw: 768 },
  "RTX A5000": { vram: 24, bw: 768 },
  "RTX A4000": { vram: 16, bw: 448 },
  "A100": { vram: 80, bw: 2039 },
  "H100": { vram: 80, bw: 3350 },
  "L40S": { vram: 48, bw: 864 },
  "L4": { vram: 24, bw: 300 },
  "T4": { vram: 16, bw: 300 },
  "RX 7900 XTX": { vram: 24, bw: 960 },
  "RX 7900 XT": { vram: 20, bw: 800 },
  "RX 7800 XT": { vram: 16, bw: 624 },
  "RX 7700 XT": { vram: 12, bw: 432 },
  "RX 7600": { vram: 8, bw: 288 },
  "RX 6900 XT": { vram: 16, bw: 512 },
  "RX 6800 XT": { vram: 16, bw: 512 },
  "RX 6800": { vram: 16, bw: 512 },
  "RX 6700 XT": { vram: 12, bw: 384 },
  "Arc A770": { vram: 16, bw: 560 },
  "Arc A750": { vram: 8, bw: 512 },
};

const APPLE_DB: Record<string, { ram: number; bw: number }> = {
  "m4 ultra": { ram: 192, bw: 819 },
  "m4 max": { ram: 36, bw: 546 },
  "m4 pro": { ram: 24, bw: 273 },
  "m4": { ram: 16, bw: 120 },
  "m3 ultra": { ram: 64, bw: 819 },
  "m3 max": { ram: 36, bw: 408 },
  "m3 pro": { ram: 18, bw: 150 },
  "m3": { ram: 8, bw: 100 },
  "m2 ultra": { ram: 64, bw: 819 },
  "m2 max": { ram: 32, bw: 408 },
  "m2 pro": { ram: 16, bw: 200 },
  "m2": { ram: 8, bw: 100 },
  "m1 ultra": { ram: 64, bw: 819 },
  "m1 max": { ram: 32, bw: 408 },
  "m1 pro": { ram: 16, bw: 200 },
  "m1": { ram: 8, bw: 68 },
};

// ── Mobile GPU Database (Android) ──────────────────────────

const MOBILE_GPU_DB: Record<string, { bw: number }> = {
  "Adreno 830": { bw: 90 },
  "Adreno 750": { bw: 77 },
  "Adreno 740": { bw: 62 },
  "Adreno 735": { bw: 51 },
  "Adreno 730": { bw: 51 },
  "Adreno 725": { bw: 44 },
  "Adreno 720": { bw: 38 },
  "Adreno 710": { bw: 34 },
  "Adreno 660": { bw: 44 },
  "Adreno 650": { bw: 44 },
  "Adreno 642": { bw: 17 },
  "Adreno 640": { bw: 34 },
  "Adreno 630": { bw: 30 },
  "Adreno 620": { bw: 17 },
  "Adreno 619": { bw: 17 },
  "Adreno 618": { bw: 14 },
  "Adreno 616": { bw: 14 },
  "Adreno 612": { bw: 10 },
  "Immortalis-G925": { bw: 77 },
  "Immortalis-G720": { bw: 77 },
  "Immortalis-G715": { bw: 51 },
  "Mali-G925": { bw: 77 },
  "Mali-G720": { bw: 77 },
  "Mali-G715": { bw: 51 },
  "Mali-G710": { bw: 44 },
  "Mali-G78": { bw: 35 },
  "Mali-G77": { bw: 30 },
  "Mali-G76": { bw: 25 },
  "Mali-G72": { bw: 20 },
  "Mali-G71": { bw: 15 },
  "Mali-G57": { bw: 17 },
  "Mali-G52": { bw: 12 },
  "Xclipse 940": { bw: 51 },
  "Xclipse 930": { bw: 44 },
  "Xclipse 920": { bw: 38 },
};

// ── iOS Device Detection ──────────────────────────────────

interface MobileDeviceInfo {
  name: string;
  ram: number;
  bw: number;
  isTablet: boolean;
}

function detectIOSDevice(cpuBenchmark: number): MobileDeviceInfo {
  const w = Math.min(screen.width, screen.height);
  const h = Math.max(screen.width, screen.height);
  const dpr = window.devicePixelRatio;
  const key = `${w}x${h}x${dpr}`;

  // Unique iPhone 16 Pro screens
  if (key === "440x956x3") return { name: "iPhone 16 Pro Max", ram: 8, bw: 68, isTablet: false };
  if (key === "402x874x3") return { name: "iPhone 16 Pro", ram: 8, bw: 68, isTablet: false };

  // iPad detection (logical width ≥ 744pt)
  if (w >= 744) {
    if (cpuBenchmark > 100) return { name: "iPad Pro (M-series)", ram: 16, bw: 100, isTablet: true };
    if (cpuBenchmark > 80) return { name: "iPad Air", ram: 8, bw: 68, isTablet: true };
    return { name: "iPad", ram: 4, bw: 42, isTablet: true };
  }

  // iPhone — use CPU benchmark to estimate chip generation
  if (cpuBenchmark > 105) return { name: "iPhone (A17 Pro / A18)", ram: 8, bw: 68, isTablet: false };
  if (cpuBenchmark > 85) return { name: "iPhone (A16)", ram: 6, bw: 51, isTablet: false };
  if (cpuBenchmark > 70) return { name: "iPhone (A15)", ram: 6, bw: 51, isTablet: false };
  if (cpuBenchmark > 55) return { name: "iPhone (A14)", ram: 4, bw: 42, isTablet: false };
  return { name: "iPhone (A13 or older)", ram: 4, bw: 34, isTablet: false };
}

function matchMobileGPU(renderer: string): { name: string; bw: number } | null {
  const normalized = renderer.toUpperCase().replace(/\(TM\)/gi, "").replace(/\s+/g, " ").trim();
  for (const [name, data] of Object.entries(MOBILE_GPU_DB)) {
    if (normalized.includes(name.toUpperCase())) return { name, bw: data.bw };
  }
  return null;
}

// ── Detection ──────────────────────────────────────────────

function getGPUInfo(): { renderer: string | null; vendor: string | null } {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { renderer: null, vendor: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return { renderer: null, vendor: null };
    return {
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
      vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
    };
  } catch {
    return { renderer: null, vendor: null };
  }
}

function matchGPU(renderer: string): { vram: number; bw: number } | null {
  const upper = renderer.toUpperCase();
  for (const [name, data] of Object.entries(GPU_DB)) {
    if (upper.includes(name.toUpperCase())) return data;
  }
  return null;
}

function matchApple(renderer: string): { ram: number; bw: number } | null {
  const lower = renderer.toLowerCase();
  for (const [chip, data] of Object.entries(APPLE_DB)) {
    if (lower.includes(chip)) return data;
  }
  if (lower.includes("apple")) return APPLE_DB["m1"];
  return null;
}

function isAppleSiliconCheck(renderer: string): boolean {
  const r = renderer.toLowerCase();
  return r.includes("apple") && (r.includes("m1") || r.includes("m2") || r.includes("m3") || r.includes("m4") || r.includes("gpu"));
}

export function cleanGPUName(renderer: string): string {
  let name = renderer
    .replace(/^ANGLE\s*\(\s*/, "")
    .replace(/\)\s*$/, "")
    .replace(/,\s*ANGLE Metal Renderer:\s*/, " — ")
    .replace(/,\s*Unspecified Version\s*/i, "")
    .replace(/,\s*Direct3D.*$/i, "")
    .replace(/,\s*OpenGL.*$/i, "")
    .replace(/,\s*Vulkan.*$/i, "")
    .replace(/vs_\d+_\d+.*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const metalMatch = name.match(/Apple\s*(?:—\s*)?(.+)/i);
  if (metalMatch) name = metalMatch[1].trim() || name;
  return name;
}

// ── CPU Benchmark (single-core, ~30ms) ────────────────────

function runCPUBenchmark(): number {
  const iterations = 2_000_000;
  const start = performance.now();
  let x = 0;
  for (let i = 0; i < iterations; i++) {
    x += Math.sqrt(i) * Math.sin(i) + Math.cos(i);
  }
  const elapsed = performance.now() - start;
  // Prevent dead code elimination
  if (x === Infinity) console.log(x);
  // Score: ops per millisecond, normalized so ~100 = fast modern CPU
  return Math.round((iterations / elapsed) * 0.05);
}

// ── Platform detection ────────────────────────────────────

function detectPlatform(): string | null {
  const ua = navigator.userAgent;
  if (ua.includes("Mac OS X")) return "macOS";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("CrOS")) return "ChromeOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return null;
}

// ── WebGPU adapter info ───────────────────────────────────

async function getWebGPUInfo(): Promise<{
  supported: boolean;
  device: string | null;
  arch: string | null;
  adapter: any;
}> {
  try {
    if (!("gpu" in navigator)) return { supported: false, device: null, arch: null, adapter: null };
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) return { supported: false, device: null, arch: null, adapter: null };

    let device: string | null = null;
    let arch: string | null = null;

    // requestAdapterInfo() — available in Chrome 113+
    if (adapter.info) {
      const info = adapter.info;
      device = info.device || info.description || null;
      arch = info.architecture || null;
    } else if (typeof adapter.requestAdapterInfo === "function") {
      try {
        const info = await adapter.requestAdapterInfo();
        device = info.device || info.description || null;
        arch = info.architecture || null;
      } catch {}
    }

    return { supported: true, device, arch, adapter };
  } catch {
    return { supported: false, device: null, arch: null, adapter: null };
  }
}

export async function detectHardware(): Promise<HardwareInfo> {
  const cpuCores = navigator.hardwareConcurrency || null;
  const deviceMemory = (navigator as any).deviceMemory || null;
  const { renderer, vendor } = getGPUInfo();
  const platform = detectPlatform();

  const cpuBenchmark = runCPUBenchmark();
  const webgpuInfo = await getWebGPUInfo();

  let isApple = renderer ? isAppleSiliconCheck(renderer) : false;
  const gpuMatch = renderer ? matchGPU(renderer) : null;
  const appleMatch = renderer ? matchApple(renderer) : null;
  const isMobile = platform === "iOS" || platform === "Android";

  let totalUsableRAM: number | null = null;
  let estimatedVRAM: number | null = null;
  let memoryBandwidth: number | null = null;
  let deviceName: string | null = null;

  if (platform === "iOS") {
    const iosDevice = detectIOSDevice(cpuBenchmark);
    deviceName = iosDevice.name;
    totalUsableRAM = iosDevice.ram;
    memoryBandwidth = iosDevice.bw;
    // Only iPad Pro M-series should be treated as Apple Silicon
    isApple = iosDevice.isTablet && cpuBenchmark > 100;
  } else if (platform === "Android") {
    const mobileGPU = renderer ? matchMobileGPU(renderer) : null;
    if (mobileGPU) {
      memoryBandwidth = mobileGPU.bw;
      deviceName = mobileGPU.name;
    }
    totalUsableRAM = deviceMemory;
    isApple = false;
  } else if (isApple && appleMatch) {
    totalUsableRAM = appleMatch.ram;
    memoryBandwidth = appleMatch.bw;
  } else if (gpuMatch) {
    estimatedVRAM = gpuMatch.vram;
    memoryBandwidth = gpuMatch.bw;
    totalUsableRAM = deviceMemory;
  } else {
    totalUsableRAM = deviceMemory;
  }

  return {
    cpuCores,
    ramGB: totalUsableRAM,
    gpuRenderer: renderer,
    gpuVendor: vendor,
    estimatedVRAM,
    webgpu: webgpuInfo.supported,
    webgpuDevice: webgpuInfo.device,
    webgpuArch: webgpuInfo.arch,
    isAppleSilicon: isApple,
    totalUsableRAM,
    memoryBandwidth,
    platform,
    cpuBenchmark,
    isMobile,
    deviceName,
  };
}

// ── Evaluation ─────────────────────────────────────────────

export function evaluateModel(vramNeeded: number, hw: HardwareInfo): ModelStatus {
  // Mobile (non-Apple-Silicon): OS reserves 45-50% of RAM
  if (hw.isMobile && !hw.isAppleSilicon && hw.totalUsableRAM) {
    const factor = hw.platform === "iOS" ? 0.50 : 0.55;
    const usable = hw.totalUsableRAM * factor;
    if (vramNeeded <= usable * 0.7) return "can-run";
    if (vramNeeded <= usable) return "tight";
    return "cannot-run";
  }
  if (hw.isAppleSilicon && hw.totalUsableRAM) {
    const usable = hw.totalUsableRAM * 0.75;
    if (vramNeeded <= usable * 0.7) return "can-run";
    if (vramNeeded <= usable) return "tight";
    return "cannot-run";
  }
  if (hw.estimatedVRAM) {
    if (vramNeeded <= hw.estimatedVRAM * 0.85) return "can-run";
    if (vramNeeded <= hw.estimatedVRAM * 1.1) return "tight";
  }
  if (hw.totalUsableRAM) {
    const usable = hw.totalUsableRAM * 0.7;
    if (vramNeeded <= usable * 0.7) return "can-run";
    if (vramNeeded <= usable) return "tight";
    return "cannot-run";
  }
  return "unknown";
}

export function estimateTokensPerSecond(modelVRAM: number, hw: HardwareInfo): number | null {
  if (!hw.memoryBandwidth) return null;
  let efficiency: number;
  if (hw.isMobile && !hw.isAppleSilicon) {
    efficiency = 0.40; // thermal throttling + shared bus contention
  } else if (hw.isAppleSilicon) {
    efficiency = 0.65;
  } else {
    efficiency = 0.70;
  }
  const toks = (hw.memoryBandwidth / modelVRAM) * efficiency;
  return Math.round(toks);
}

export function memoryPercentage(vramNeeded: number, hw: HardwareInfo): number | null {
  const total = (hw.isMobile || hw.isAppleSilicon) ? hw.totalUsableRAM : (hw.estimatedVRAM || hw.totalUsableRAM);
  if (!total) return null;
  return Math.round((vramNeeded / total) * 100);
}

function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

export function computeScore(status: ModelStatus, toksPerSec: number | null, paramsBillions: number, memPct: number | null = null): number {
  if (status === "cannot-run" || status === "unknown") return 0;

  // Speed score — continuous interpolation for smooth distribution
  let speedScore = 0;
  if (toksPerSec !== null) {
    if (toksPerSec >= 80) speedScore = 100;
    else if (toksPerSec >= 40) speedScore = lerp(toksPerSec, 40, 80, 80, 100);
    else if (toksPerSec >= 20) speedScore = lerp(toksPerSec, 20, 40, 55, 80);
    else if (toksPerSec >= 10) speedScore = lerp(toksPerSec, 10, 20, 35, 55);
    else if (toksPerSec >= 5) speedScore = lerp(toksPerSec, 5, 10, 15, 35);
    else speedScore = lerp(Math.max(toksPerSec, 0), 0, 5, 0, 15);
  } else {
    speedScore = status === "can-run" ? 45 : 20;
  }

  // Memory headroom score — continuous interpolation
  let headroomScore = 45;
  if (memPct !== null) {
    if (memPct <= 20) headroomScore = 100;
    else if (memPct <= 40) headroomScore = lerp(memPct, 20, 40, 100, 75);
    else if (memPct <= 60) headroomScore = lerp(memPct, 40, 60, 75, 45);
    else if (memPct <= 80) headroomScore = lerp(memPct, 60, 80, 45, 20);
    else headroomScore = lerp(Math.min(memPct, 100), 80, 100, 20, 0);
  }

  // Quality bonus
  const qualityBonus = Math.min(12, Math.log2(paramsBillions + 1) * 2);

  const fitMultiplier = status === "tight" ? 0.75 : 1;

  return Math.round(((speedScore * 0.55 + headroomScore * 0.35 + qualityBonus) * fitMultiplier));
}

export function scoreToGrade(score: number, status: ModelStatus): Grade {
  if (status === "cannot-run") return "F";
  if (status === "unknown") return "?";
  if (score >= 85) return "S";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

export function getDisplayName(hw: HardwareInfo): string {
  if (hw.deviceName) return hw.deviceName;
  if (hw.gpuRenderer) return cleanGPUName(hw.gpuRenderer);
  return "Unknown";
}

export const GRADES: Record<Grade, GradeInfo> = {
  "S": { letter: "S", label: "Runs great",  color: "#22c55e" },
  "A": { letter: "A", label: "Runs well",   color: "#4ade80" },
  "B": { letter: "B", label: "Decent",      color: "#a3e635" },
  "C": { letter: "C", label: "Tight fit",   color: "#f59e0b" },
  "D": { letter: "D", label: "Barely runs", color: "#f97316" },
  "F": { letter: "F", label: "Too heavy",   color: "#ef4444" },
  "?": { letter: "?", label: "Unknown",     color: "#56565f" },
};
