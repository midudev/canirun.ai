// ── Types ──────────────────────────────────────────────────

export interface HardwareInfo {
  gpuRenderer: string | null;
  gpuVendor: string | null;
  gpuCores: number | null;
  ramGB: number | null;
  estimatedVRAM: number | null;
  memoryBandwidth: number | null;
  webgpu: boolean;
  webgpuDevice: string | null;
  webgpuArch: string | null;
  isAppleSilicon: boolean;
  totalUsableRAM: number | null;
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

const GPU_DB: Record<string, { vram: number; bw: number; cores: number }> = {
  "RTX 5090": { vram: 32, bw: 1792, cores: 21760 },
  "RTX 5080": { vram: 16, bw: 960, cores: 10752 },
  "RTX 5070 Ti": { vram: 16, bw: 896, cores: 8960 },
  "RTX 5070": { vram: 12, bw: 672, cores: 6144 },
  "RTX 4090": { vram: 24, bw: 1008, cores: 16384 },
  "RTX 4080 SUPER": { vram: 16, bw: 736, cores: 10240 },
  "RTX 4080": { vram: 16, bw: 717, cores: 9728 },
  "RTX 4070 Ti SUPER": { vram: 16, bw: 672, cores: 8448 },
  "RTX 4070 Ti": { vram: 12, bw: 504, cores: 7680 },
  "RTX 4070 SUPER": { vram: 12, bw: 504, cores: 7168 },
  "RTX 4070": { vram: 12, bw: 504, cores: 5888 },
  "RTX 4060 Ti 16GB": { vram: 16, bw: 288, cores: 4352 },
  "RTX 4060 Ti": { vram: 8, bw: 288, cores: 4352 },
  "RTX 4060": { vram: 8, bw: 272, cores: 3072 },
  "RTX 3090 Ti": { vram: 24, bw: 1008, cores: 10752 },
  "RTX 3090": { vram: 24, bw: 936, cores: 10496 },
  "RTX 3080 Ti": { vram: 12, bw: 912, cores: 10240 },
  "RTX 3080 12GB": { vram: 12, bw: 912, cores: 8960 },
  "RTX 3080": { vram: 10, bw: 760, cores: 8704 },
  "RTX 3070 Ti": { vram: 8, bw: 608, cores: 6144 },
  "RTX 3070": { vram: 8, bw: 448, cores: 5888 },
  "RTX 3060 Ti": { vram: 8, bw: 448, cores: 4864 },
  "RTX 3060": { vram: 12, bw: 360, cores: 3584 },
  "RTX 3050": { vram: 8, bw: 224, cores: 2560 },
  "RTX A6000": { vram: 48, bw: 768, cores: 10752 },
  "RTX A5000": { vram: 24, bw: 768, cores: 8192 },
  "RTX A4000": { vram: 16, bw: 448, cores: 6144 },

  // RTX 20 series - importantes
  "RTX 2080 Ti": { vram: 11, bw: 616, cores: 4352 },
  "RTX 2080 SUPER": { vram: 8, bw: 496, cores: 3072 },
  "RTX 2080": { vram: 8, bw: 448, cores: 2944 },
  "RTX 2070 SUPER": { vram: 8, bw: 448, cores: 2560 },
  "RTX 2070": { vram: 8, bw: 448, cores: 2304 },
  "RTX 2060 SUPER": { vram: 8, bw: 448, cores: 2176 },
  "RTX 2060": { vram: 6, bw: 336, cores: 1920 },

  // Variantes útiles
  "RTX 2060 12GB": { vram: 12, bw: 336, cores: 2176 },
  "RTX 3050 6GB": { vram: 6, bw: 168, cores: 2304 },

  "A100": { vram: 80, bw: 2039, cores: 6912 },
  "H100": { vram: 80, bw: 3350, cores: 14592 },
  "L40S": { vram: 48, bw: 864, cores: 18176 },
  "L4": { vram: 24, bw: 300, cores: 7424 },
  "T4": { vram: 16, bw: 300, cores: 2560 },
  "RX 7900 XTX": { vram: 24, bw: 960, cores: 6144 },
  "RX 7900 XT": { vram: 20, bw: 800, cores: 5376 },
  "RX 7800 XT": { vram: 16, bw: 624, cores: 3840 },
  "RX 7700 XT": { vram: 12, bw: 432, cores: 3456 },
  "RX 7600": { vram: 8, bw: 288, cores: 2048 },
  "RX 6900 XT": { vram: 16, bw: 512, cores: 5120 },
  "RX 6800 XT": { vram: 16, bw: 512, cores: 4608 },
  "RX 6800": { vram: 16, bw: 512, cores: 3840 },
  "RX 6700 XT": { vram: 12, bw: 384, cores: 2560 },
  "Arc A770": { vram: 16, bw: 560, cores: 4096 },
  "Arc A750": { vram: 8, bw: 512, cores: 3584 },
};

const APPLE_DB: Record<string, { ram: number; bw: number; cpuCores: number; gpuCores: number }> = {
  "m4 ultra": { ram: 192, bw: 819, cpuCores: 28, gpuCores: 60 },
  "m4 max": { ram: 36, bw: 546, cpuCores: 12, gpuCores: 32 },
  "m4 pro": { ram: 24, bw: 273, cpuCores: 12, gpuCores: 18 },
  "m4": { ram: 16, bw: 120, cpuCores: 10, gpuCores: 10 },
  "m3 ultra": { ram: 64, bw: 819, cpuCores: 24, gpuCores: 60 },
  "m3 max": { ram: 36, bw: 408, cpuCores: 14, gpuCores: 30 },
  "m3 pro": { ram: 18, bw: 150, cpuCores: 11, gpuCores: 14 },
  "m3": { ram: 8, bw: 100, cpuCores: 8, gpuCores: 10 },
  "m2 ultra": { ram: 64, bw: 819, cpuCores: 24, gpuCores: 60 },
  "m2 max": { ram: 32, bw: 408, cpuCores: 12, gpuCores: 30 },
  "m2 pro": { ram: 16, bw: 200, cpuCores: 10, gpuCores: 16 },
  "m2": { ram: 8, bw: 100, cpuCores: 8, gpuCores: 10 },
  "m1 ultra": { ram: 64, bw: 819, cpuCores: 20, gpuCores: 48 },
  "m1 max": { ram: 32, bw: 408, cpuCores: 10, gpuCores: 24 },
  "m1 pro": { ram: 16, bw: 200, cpuCores: 8, gpuCores: 14 },
  "m1": { ram: 8, bw: 68, cpuCores: 8, gpuCores: 7 },
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
  cpuCores: number;
  gpuCores: number;
  isTablet: boolean;
}

function detectIOSDevice(cpuBenchmark: number): MobileDeviceInfo {
  const w = Math.min(screen.width, screen.height);
  const h = Math.max(screen.width, screen.height);
  const dpr = window.devicePixelRatio;
  const key = `${w}x${h}x${dpr}`;

  // iPad detection (logical width ≥ 744pt)
  if (w >= 744) {
    if (cpuBenchmark > 100) return { name: "iPad Pro (M-series)", ram: 16, bw: 100, cpuCores: 10, gpuCores: 10, isTablet: true };
    if (cpuBenchmark > 80) return { name: "iPad Air", ram: 8, bw: 68, cpuCores: 8, gpuCores: 10, isTablet: true };
    return { name: "iPad", ram: 4, bw: 42, cpuCores: 6, gpuCores: 4, isTablet: true };
  }

  // Screen sizes exclusive to Pro / Pro Max models (higher RAM)
  const proMaxScreens = ["440x956x3"];
  const proScreens = ["402x874x3"];
  const isPro = proScreens.includes(key) || proMaxScreens.includes(key);
  const suffix = proMaxScreens.includes(key) ? " Pro Max" : proScreens.includes(key) ? " Pro" : "";

  // Estimate chip generation from CPU benchmark + screen tier
  if (cpuBenchmark > 115) return { name: `iPhone${suffix} (A19 Pro)`, ram: 8, bw: 77, cpuCores: 6, gpuCores: 6, isTablet: false };
  if (cpuBenchmark > 105) return { name: `iPhone${suffix} (A18 Pro)`, ram: 8, bw: 68, cpuCores: 6, gpuCores: 6, isTablet: false };
  if (cpuBenchmark > 90) return { name: `iPhone${suffix} (A17 Pro)`, ram: 8, bw: 68, cpuCores: 6, gpuCores: 6, isTablet: false };
  if (cpuBenchmark > 75) return { name: `iPhone (A16)`, ram: isPro ? 8 : 6, bw: 51, cpuCores: 6, gpuCores: 5, isTablet: false };
  if (cpuBenchmark > 60) return { name: `iPhone (A15)`, ram: 6, bw: 51, cpuCores: 6, gpuCores: 5, isTablet: false };
  if (cpuBenchmark > 45) return { name: `iPhone (A14)`, ram: 4, bw: 42, cpuCores: 6, gpuCores: 4, isTablet: false };
  return { name: "iPhone (A13 or older)", ram: 4, bw: 34, cpuCores: 6, gpuCores: 4, isTablet: false };
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

function matchGPU(renderer: string): { vram: number; bw: number; cores: number } | null {
  const upper = renderer.toUpperCase();
  for (const [name, data] of Object.entries(GPU_DB)) {
    if (upper.includes(name.toUpperCase())) return data;
  }
  return null;
}

function parseVRAMFromName(renderer: string): number | null {
  const m = renderer.match(/\((\d+)\s*GB\)/i) || renderer.match(/\b(\d+)\s*GB\b/i);
  if (m) {
    const gb = parseInt(m[1], 10);
    if (gb >= 1 && gb <= 128) return gb;
  }
  return null;
}

function matchApple(renderer: string): { ram: number; bw: number; cpuCores: number; gpuCores: number } | null {
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
    .replace(/\s+Direct3D\d*/i, "")
    .replace(/vs_\d+_\d+.*$/, "")
    .replace(/\(0x[0-9A-Fa-f]+\)/g, "")
    .replace(/\s*\(\d+\s*GB\)/gi, "")
    .replace(/\s+\d+\s*GB\b/gi, "")
    .replace(/^(NVIDIA|AMD|Intel),\s*\1\b/i, "$1")
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
  // iPhone/iPad must be checked before "Mac OS X" — iOS UAs contain both
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Mac OS X")) return "macOS";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("CrOS")) return "ChromeOS";
  if (ua.includes("Linux")) return "Linux";
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

// ── GPU Core Estimation (WebGPU benchmark fallback) ───────

const GFLOPS_PER_CORE: Record<string, number> = {
  apple: 400,
  nvidia: 5,
  amd: 4.5,
  ati: 4.5,
  intel: 16,
  qualcomm: 3,
  arm: 8,
};

async function estimateGPUCores(adapter: any, vendor: string | null): Promise<number | null> {
  try {
    const device = await adapter.requestDevice();
    const numElements = 512 * 1024;
    const iterations = 512;

    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read_write> data: array<f32>;
        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) id: vec3u) {
          let idx = id.x;
          if (idx >= ${numElements}u) { return; }
          var x: f32 = f32(idx) * 0.001;
          for (var i: u32 = 0; i < ${iterations}u; i++) {
            x = x * 1.0001 + 0.0001;
          }
          data[idx] = x;
        }
      `,
    });

    const buffer = device.createBuffer({
      size: numElements * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer } }],
    });

    const dispatch = () => {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(numElements / 256));
      pass.end();
      device.queue.submit([enc.finish()]);
      return device.queue.onSubmittedWorkDone();
    };

    // Warmup pass
    await dispatch();

    // Timed pass
    const start = performance.now();
    await dispatch();
    const elapsed = performance.now() - start;

    buffer.destroy();
    device.destroy();

    // 2 FLOPs per iteration (multiply + add)
    const gflops = (numElements * iterations * 2) / elapsed / 1e6;

    const v = (vendor || "").toLowerCase();
    for (const [key, ratio] of Object.entries(GFLOPS_PER_CORE)) {
      if (v.includes(key)) return Math.round(gflops / ratio);
    }
    return null;
  } catch {
    return null;
  }
}

async function estimateBandwidthFromWebGPU(adapter: any): Promise<number | null> {
  try {
    const device = await adapter.requestDevice();
    const numElements = 4 * 1024 * 1024;
    const byteSize = numElements * 16;

    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read> src: array<vec4<f32>>;
        @group(0) @binding(1) var<storage, read_write> dst: array<vec4<f32>>;
        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) id: vec3u) {
          if (id.x < ${numElements}u) {
            dst[id.x] = src[id.x];
          }
        }
      `,
    });

    const srcBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE,
    });
    const dstBuffer = device.createBuffer({
      size: byteSize,
      usage: GPUBufferUsage.STORAGE,
    });

    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: srcBuffer } },
        { binding: 1, resource: { buffer: dstBuffer } },
      ],
    });

    const submit = () => {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(numElements / 256));
      pass.end();
      device.queue.submit([enc.finish()]);
    };

    submit();
    await device.queue.onSubmittedWorkDone();

    const passes = 10;
    const start = performance.now();
    for (let i = 0; i < passes; i++) submit();
    await device.queue.onSubmittedWorkDone();
    const elapsed = performance.now() - start;

    srcBuffer.destroy();
    dstBuffer.destroy();
    device.destroy();

    const totalBytes = byteSize * 2 * passes;
    const measuredGBs = totalBytes / elapsed / 1e6;
    // Compute-copy typically achieves ~60% of peak HW bandwidth
    return Math.round(measuredGBs / 0.6);
  } catch {
    return null;
  }
}

function estimateVRAMFromWebGPU(adapter: any): number | null {
  try {
    const maxBuffer = adapter.limits?.maxBufferSize;
    if (!maxBuffer) return null;

    const maxBufferGB = maxBuffer / (1024 ** 3);
    if (maxBufferGB < 0.5) return null;

    const rawEstimate = maxBufferGB * 2;
    const commonSizes = [2, 3, 4, 6, 8, 10, 11, 12, 16, 20, 24, 32, 48, 64, 80, 128, 192];
    let closest = commonSizes[0];
    for (const size of commonSizes) {
      if (Math.abs(size - rawEstimate) < Math.abs(closest - rawEstimate)) {
        closest = size;
      }
    }
    return closest >= 2 ? closest : null;
  } catch {
    return null;
  }
}

export async function detectHardware(): Promise<HardwareInfo> {
  const deviceMemory = (navigator as any).deviceMemory || null;
  const { renderer, vendor } = getGPUInfo();
  const platform = detectPlatform();

  const cpuBenchmark = runCPUBenchmark();
  const webgpuInfo = await getWebGPUInfo();

  let isApple = renderer ? isAppleSiliconCheck(renderer) : false;
  const gpuMatch = renderer ? matchGPU(renderer) : null;
  const appleMatch = renderer ? matchApple(renderer) : null;
  const parsedVRAM = renderer ? parseVRAMFromName(renderer) : null;
  const isMobile = platform === "iOS" || platform === "Android";

  let totalUsableRAM: number | null = null;
  let estimatedVRAM: number | null = null;
  let memoryBandwidth: number | null = null;
  let deviceName: string | null = null;
  let gpuCores: number | null = null;

  if (platform === "iOS") {
    const iosDevice = detectIOSDevice(cpuBenchmark);
    deviceName = iosDevice.name;
    totalUsableRAM = iosDevice.ram;
    memoryBandwidth = iosDevice.bw;
    gpuCores = iosDevice.gpuCores;
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
    gpuCores = appleMatch.gpuCores;
  } else if (gpuMatch) {
    estimatedVRAM = parsedVRAM ?? gpuMatch.vram;
    memoryBandwidth = gpuMatch.bw;
    gpuCores = gpuMatch.cores;
    totalUsableRAM = estimatedVRAM;
  } else {
    totalUsableRAM = deviceMemory;
    if (parsedVRAM) {
      estimatedVRAM = parsedVRAM;
      totalUsableRAM = parsedVRAM;
    }
  }

  // Fallback: estimate GPU cores via WebGPU compute benchmark
  if (!gpuCores && webgpuInfo.adapter) {
    gpuCores = await estimateGPUCores(webgpuInfo.adapter, vendor);
  }

  // Fallback: estimate VRAM via WebGPU maxBufferSize for discrete desktop GPUs
  if (!estimatedVRAM && !isApple && !isMobile && webgpuInfo.adapter) {
    const webgpuVRAM = estimateVRAMFromWebGPU(webgpuInfo.adapter);
    if (webgpuVRAM) {
      estimatedVRAM = webgpuVRAM;
      totalUsableRAM = webgpuVRAM;
    }
  }

  // Fallback: estimate bandwidth via WebGPU copy benchmark
  if (!memoryBandwidth && webgpuInfo.adapter) {
    memoryBandwidth = await estimateBandwidthFromWebGPU(webgpuInfo.adapter);
  }

  return {
    gpuRenderer: renderer,
    gpuVendor: vendor,
    gpuCores,
    ramGB: totalUsableRAM,
    estimatedVRAM,
    memoryBandwidth,
    webgpu: webgpuInfo.supported,
    webgpuDevice: webgpuInfo.device,
    webgpuArch: webgpuInfo.arch,
    isAppleSilicon: isApple,
    totalUsableRAM,
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

export interface ModelEvaluation {
  status: ModelStatus;
  toksPerSec: number | null;
  memPct: number | null;
  score: number;
  grade: Grade;
}

export function evaluateModelComplete(vramGB: number, hw: HardwareInfo, paramsBillions: number): ModelEvaluation {
  const status = evaluateModel(vramGB, hw);
  const toksPerSec = estimateTokensPerSecond(vramGB, hw);
  const memPct = memoryPercentage(vramGB, hw);
  const score = computeScore(status, toksPerSec, paramsBillions, memPct);
  const grade = scoreToGrade(score, status);
  return { status, toksPerSec, memPct, score, grade };
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

// ── Hardware Overrides (localStorage) ──────────────────────

const HW_OVERRIDE_KEY = "canirun-hw-overrides";

export interface HardwareOverrides {
  ramGB?: number;
  memoryBandwidth?: number;
  gpuCores?: number;
}

export function getHardwareOverrides(): HardwareOverrides {
  try {
    const raw = localStorage.getItem(HW_OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveHardwareOverrides(overrides: HardwareOverrides): void {
  try {
    const clean: HardwareOverrides = {};
    if (overrides.ramGB !== undefined) clean.ramGB = overrides.ramGB;
    if (overrides.memoryBandwidth !== undefined) clean.memoryBandwidth = overrides.memoryBandwidth;
    if (overrides.gpuCores !== undefined) clean.gpuCores = overrides.gpuCores;
    if (Object.keys(clean).length === 0) {
      localStorage.removeItem(HW_OVERRIDE_KEY);
    } else {
      localStorage.setItem(HW_OVERRIDE_KEY, JSON.stringify(clean));
    }
  } catch {}
}

export function applyOverrides(hw: HardwareInfo, overrides?: HardwareOverrides): HardwareInfo {
  const o = overrides ?? getHardwareOverrides();
  if (Object.keys(o).length === 0) return hw;
  const result = { ...hw };
  if (o.ramGB !== undefined) {
    result.ramGB = o.ramGB;
    result.totalUsableRAM = o.ramGB;
    if (result.estimatedVRAM !== null) {
      result.estimatedVRAM = o.ramGB;
    }
  }
  if (o.memoryBandwidth !== undefined) {
    result.memoryBandwidth = o.memoryBandwidth;
  }
  if (o.gpuCores !== undefined) {
    result.gpuCores = o.gpuCores;
  }
  return result;
}

export const RAM_OPTIONS = [2, 4, 6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128, 192];
export const BW_OPTIONS = [50, 68, 100, 120, 150, 200, 224, 273, 288, 300, 360, 408, 448, 504, 546, 672, 768, 819, 960, 1008, 1792, 2039, 3350];
export const GPU_CORES_OPTIONS = [256, 512, 1024, 2048, 3072, 4096, 5120, 6144, 7168, 8192, 9728, 10240, 10752, 14592, 16384, 18176, 21760];

export function buildSelectOptions(presets: number[], detected: number | null): number[] {
  const set = new Set(presets);
  if (detected !== null && detected > 0) set.add(detected);
  return Array.from(set).sort((a, b) => a - b);
}
