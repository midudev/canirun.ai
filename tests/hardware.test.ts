import { describe, expect, it } from "vitest";
import {
  GPU_DB,
  APPLE_DB,
  MOBILE_GPU_DB,
  SBC_DB,
  getGPUCategory,
  cleanGPUName,
  matchGPU,
  parseVRAMFromName,
  matchApple,
  isAppleSiliconCheck,
  evaluateModel,
  estimateTokensPerSecond,
  memoryPercentage,
  computeScore,
  scoreToGrade,
  evaluateModelComplete,
  applyOverrides,
  getDeviceOverrides,
  buildSelectOptions,
  DEVICE_CATEGORY_ORDER,
  type HardwareInfo,
  type ModelStatus,
} from "../src/lib/hardware";

// ── Helpers ──────────────────────────────────────────────────

function makeHW(overrides: Partial<HardwareInfo> = {}): HardwareInfo {
  return {
    gpuRenderer: null,
    gpuVendor: null,
    gpuCores: null,
    ramGB: null,
    estimatedVRAM: null,
    memoryBandwidth: null,
    systemRAM: null,
    webgpu: false,
    webgpuDevice: null,
    webgpuArch: null,
    isAppleSilicon: false,
    totalUsableRAM: null,
    platform: null,
    cpuBenchmark: null,
    isMobile: false,
    deviceName: null,
    ...overrides,
  };
}

// ── GPU_DB integrity ─────────────────────────────────────────

describe("GPU_DB integrity", () => {
  it("every entry has positive vram, bw, and cores", () => {
    for (const [name, data] of Object.entries(GPU_DB)) {
      // iGPUs with shared memory can have vram=0
      expect(data.bw).toBeGreaterThan(0);
      expect(data.cores).toBeGreaterThan(0);
      if (data.vram < 0) throw new Error(`${name} has negative vram`);
    }
  });

  it("every GPU_DB entry has a valid category", () => {
    for (const name of Object.keys(GPU_DB)) {
      const cat = getGPUCategory(name);
      expect(cat).not.toBe("Other");
    }
  });

  it("every category returned by getGPUCategory exists in DEVICE_CATEGORY_ORDER", () => {
    const allCategories = new Set<string>();
    for (const name of Object.keys(GPU_DB)) {
      allCategories.add(getGPUCategory(name));
    }
    for (const cat of allCategories) {
      expect(DEVICE_CATEGORY_ORDER).toContain(cat);
    }
  });
});

// ── getGPUCategory ───────────────────────────────────────────

describe("getGPUCategory", () => {
  describe("NVIDIA consumer series", () => {
    it.each([
      ["RTX 5090", "NVIDIA RTX 50"],
      ["RTX 5080", "NVIDIA RTX 50"],
      ["RTX 5070 Ti", "NVIDIA RTX 50"],
      ["RTX 5070", "NVIDIA RTX 50"],
      ["RTX 5060 Ti", "NVIDIA RTX 50"],
      ["RTX 5050", "NVIDIA RTX 50"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });

    it.each([
      ["RTX 4090", "NVIDIA RTX 40"],
      ["RTX 4080 SUPER", "NVIDIA RTX 40"],
      ["RTX 4060 Ti", "NVIDIA RTX 40"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });

    it.each([
      ["RTX 3090", "NVIDIA RTX 30"],
      ["RTX 3080 Ti", "NVIDIA RTX 30"],
      ["RTX 3060", "NVIDIA RTX 30"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });

    it.each([
      ["RTX 2080 Ti", "NVIDIA RTX 20"],
      ["RTX 2060", "NVIDIA RTX 20"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });
  });

  describe("NVIDIA professional Ada — must NOT be classified as consumer", () => {
    it.each([
      ["RTX 6000 Ada", "NVIDIA Pro"],
      ["RTX 5880 Ada", "NVIDIA Pro"],
      ["RTX 5000 Ada", "NVIDIA Pro"],
      ["RTX 4500 Ada", "NVIDIA Pro"],
      ["RTX 4000 Ada", "NVIDIA Pro"],
      ["RTX 4000 SFF Ada", "NVIDIA Pro"],
      ["RTX 3500 Ada", "NVIDIA Pro"],
      ["RTX 2000 Ada", "NVIDIA Pro"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });
  });

  describe("NVIDIA professional Ampere / Turing", () => {
    it.each([
      ["RTX PRO 6000", "NVIDIA Pro"],
      ["RTX A6000", "NVIDIA Pro"],
      ["RTX A5500", "NVIDIA Pro"],
      ["RTX A5000", "NVIDIA Pro"],
      ["RTX A4500", "NVIDIA Pro"],
      ["RTX A4000", "NVIDIA Pro"],
      ["RTX A2000", "NVIDIA Pro"],
      ["Quadro RTX 8000", "NVIDIA Pro"],
      ["Quadro RTX 6000", "NVIDIA Pro"],
      ["Quadro RTX 5000", "NVIDIA Pro"],
      ["Quadro RTX 4000", "NVIDIA Pro"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });
  });

  describe("NVIDIA datacenter", () => {
    it.each([
      ["A100", "NVIDIA Datacenter"],
      ["H100", "NVIDIA Datacenter"],
      ["GH200", "NVIDIA Datacenter"],
      ["DGX Spark", "NVIDIA Datacenter"],
      ["L40S", "NVIDIA Datacenter"],
      ["L4", "NVIDIA Datacenter"],
      ["T4", "NVIDIA Datacenter"],
      ["Tesla P40", "NVIDIA Datacenter"],
      ["Tesla V100", "NVIDIA Datacenter"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });
  });

  describe("NVIDIA GTX series", () => {
    it.each([
      ["GTX 1660 Ti", "NVIDIA GTX 16"],
      ["GTX 1650", "NVIDIA GTX 16"],
      ["GTX 1080 Ti", "NVIDIA GTX 10"],
      ["GTX 1060 6GB", "NVIDIA GTX 10"],
      ["GTX 980 Ti", "NVIDIA GTX 9"],
      ["GTX 950", "NVIDIA GTX 9"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });
  });

  describe("AMD GPUs", () => {
    it.each([
      ["RX 9070 XT", "AMD RX 9000"],
      ["RX 7900 XTX", "AMD RX 7000"],
      ["RX 6800 XT", "AMD RX 6000"],
      ["RX 5700 XT", "AMD RX 5000"],
      ["Radeon VII", "AMD Older"],
      ["Vega 64", "AMD Older"],
      ["Radeon 780M", "AMD Integrated"],
      ["Ryzen AI MAX+ 395", "AMD Integrated"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });
  });

  describe("Intel GPUs", () => {
    it.each([
      ["Arc A770", "Intel Arc"],
      ["Arc A750", "Intel Arc"],
      ["Iris Xe", "Intel Integrated"],
      ["UHD 770", "Intel Integrated"],
    ])("%s → %s", (name, expected) => {
      expect(getGPUCategory(name)).toBe(expected);
    });
  });
});

// ── matchGPU ─────────────────────────────────────────────────

describe("matchGPU", () => {
  it("matches exact GPU_DB entries", () => {
    const result = matchGPU("NVIDIA GeForce RTX 4090");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(24);
  });

  it("RTX 5000 Ada — matches the 32GB pro card, not a consumer card", () => {
    const result = matchGPU("NVIDIA RTX 5000 Ada Generation/PCIe/SSE2");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(32);
    expect(result!.cores).toBe(12800);
  });

  it("RTX 5000 Ada — case-insensitive", () => {
    const result = matchGPU("nvidia rtx 5000 ada generation");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(32);
  });

  it("RTX 5090 is NOT confused with RTX 5000 Ada", () => {
    const result = matchGPU("NVIDIA GeForce RTX 5090/PCIe");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(32);
    expect(result!.cores).toBe(21760);
  });

  it("RTX 4090 is NOT confused with RTX 4000 Ada", () => {
    const result = matchGPU("NVIDIA GeForce RTX 4090");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(24);
    expect(result!.cores).toBe(16384);
  });

  it("prefers longest match (RTX 4080 SUPER over RTX 4080)", () => {
    const result = matchGPU("NVIDIA GeForce RTX 4080 SUPER");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(16);
    expect(result!.cores).toBe(10240);
  });

  it("matches laptop variants", () => {
    const result = matchGPU("NVIDIA GeForce RTX 4090 Laptop GPU");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(16);
  });

  it("matches AMD GPUs", () => {
    const result = matchGPU("AMD Radeon RX 7900 XTX");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(24);
  });

  it("matches Intel Arc", () => {
    const result = matchGPU("Intel(R) Arc(TM) A770 Graphics");
    expect(result).not.toBeNull();
    expect(result!.vram).toBe(16);
  });

  it("returns null for unknown GPUs", () => {
    expect(matchGPU("Some Unknown GPU")).toBeNull();
  });

  describe("real-world Linux renderer strings", () => {
    it("NVIDIA proprietary driver format", () => {
      const result = matchGPU("NVIDIA RTX 5000 Ada Generation/PCIe/SSE2");
      expect(result).not.toBeNull();
      expect(result!.vram).toBe(32);
    });

    it("Mesa/NVIDIA format", () => {
      const result = matchGPU("NV198 (RTX 4090)");
      expect(result).not.toBeNull();
      expect(result!.vram).toBe(24);
    });

    it("ANGLE wrapper format (Windows/Chrome)", () => {
      const result = matchGPU("ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0)");
      expect(result).not.toBeNull();
      expect(result!.vram).toBe(10);
    });
  });
});

// ── parseVRAMFromName ────────────────────────────────────────

describe("parseVRAMFromName", () => {
  it("parses '(16 GB)' format", () => {
    expect(parseVRAMFromName("NVIDIA GeForce RTX 4060 Ti (16 GB)")).toBe(16);
  });

  it("parses '16GB' without parens", () => {
    expect(parseVRAMFromName("RTX 4060 Ti 16GB")).toBe(16);
  });

  it("parses '8 GB' with space", () => {
    expect(parseVRAMFromName("RTX 3060 8 GB")).toBe(8);
  });

  it("returns null when no VRAM info", () => {
    expect(parseVRAMFromName("NVIDIA GeForce RTX 4090")).toBeNull();
  });

  it("rejects unreasonable values (>128)", () => {
    expect(parseVRAMFromName("GPU 256GB")).toBeNull();
  });
});

// ── cleanGPUName ─────────────────────────────────────────────

describe("cleanGPUName", () => {
  it("strips ANGLE wrapper", () => {
    expect(cleanGPUName("ANGLE (NVIDIA GeForce RTX 4090, Direct3D11)")).toBe(
      "NVIDIA GeForce RTX 4090"
    );
  });

  it("strips OpenGL suffix", () => {
    expect(cleanGPUName("NVIDIA GeForce RTX 3080, OpenGL 4.6")).toBe(
      "NVIDIA GeForce RTX 3080"
    );
  });

  it("strips VRAM from name (ANGLE-wrapped)", () => {
    expect(cleanGPUName("ANGLE (NVIDIA GeForce RTX 4060 Ti (16 GB), Direct3D11)")).toBe(
      "NVIDIA GeForce RTX 4060 Ti"
    );
  });

  it("strips inline VRAM without parens", () => {
    expect(cleanGPUName("NVIDIA GeForce RTX 3060 12GB")).toBe(
      "NVIDIA GeForce RTX 3060"
    );
  });

  it("strips hex IDs (ANGLE-wrapped)", () => {
    expect(cleanGPUName("ANGLE (NVIDIA (0x2684), Direct3D11)")).toBe("NVIDIA");
  });

  it("extracts Apple chip from Metal renderer", () => {
    const result = cleanGPUName("Apple — Apple M3 Max");
    expect(result).toContain("M3 Max");
  });
});

// ── Apple Silicon detection ──────────────────────────────────

describe("isAppleSiliconCheck", () => {
  it("detects Apple M1", () => {
    expect(isAppleSiliconCheck("Apple M1")).toBe(true);
  });

  it("detects Apple M4 Max", () => {
    expect(isAppleSiliconCheck("Apple M4 Max")).toBe(true);
  });

  it("detects generic Apple GPU", () => {
    expect(isAppleSiliconCheck("Apple GPU")).toBe(true);
  });

  it("rejects non-Apple renderers", () => {
    expect(isAppleSiliconCheck("NVIDIA GeForce RTX 4090")).toBe(false);
  });
});

describe("matchApple", () => {
  it("matches M3 Max with correct base RAM", () => {
    const result = matchApple("Apple M3 Max");
    expect(result).not.toBeNull();
    expect(result!.ram).toBe(APPLE_DB["m3 max"].ram);
    expect(result!.bw).toBe(APPLE_DB["m3 max"].bw);
  });

  it("matches M1 basic", () => {
    const result = matchApple("Apple M1");
    expect(result).not.toBeNull();
    expect(result!.ram).toBe(APPLE_DB["m1"].ram);
  });

  it("matches M4 Pro", () => {
    const result = matchApple("Apple M4 Pro");
    expect(result).not.toBeNull();
    expect(result!.ram).toBe(APPLE_DB["m4 pro"].ram);
  });

  it("falls back to M1 for unknown Apple chip", () => {
    const result = matchApple("Apple M99");
    expect(result).not.toBeNull();
    expect(result!.ram).toBe(APPLE_DB["m1"].ram);
  });

  it("returns null for non-Apple", () => {
    expect(matchApple("NVIDIA RTX 4090")).toBeNull();
  });

  it("every APPLE_DB chip is matchable", () => {
    for (const chip of Object.keys(APPLE_DB)) {
      const result = matchApple(`Apple ${chip}`);
      expect(result).not.toBeNull();
    }
  });
});

// ── evaluateModel ────────────────────────────────────────────

describe("evaluateModel", () => {
  describe("discrete GPU (VRAM-based)", () => {
    const hw = makeHW({ estimatedVRAM: 16, memoryBandwidth: 960, systemRAM: 64 });

    it("can-run when model fits comfortably (<=85% VRAM)", () => {
      expect(evaluateModel(12, hw)).toBe("can-run");
    });

    it("tight when model is close to VRAM limit (85-110%)", () => {
      expect(evaluateModel(15, hw)).toBe("tight");
    });

    it("can-run-slow when model exceeds VRAM but fits via offloading", () => {
      expect(evaluateModel(40, hw)).toBe("can-run-slow");
    });

    it("cannot-run when model exceeds VRAM+RAM", () => {
      expect(evaluateModel(100, hw)).toBe("cannot-run");
    });
  });

  describe("discrete GPU without system RAM — no offloading", () => {
    const hw = makeHW({ estimatedVRAM: 16, memoryBandwidth: 960, systemRAM: null });

    it("cannot-run when model exceeds VRAM (no offloading available)", () => {
      expect(evaluateModel(20, hw)).toBe("cannot-run");
    });
  });

  describe("offloading only when systemRAM > estimatedVRAM", () => {
    const hw = makeHW({ estimatedVRAM: 16, memoryBandwidth: 960, systemRAM: 8 });

    it("no offloading when systemRAM <= estimatedVRAM", () => {
      expect(evaluateModel(20, hw)).toBe("cannot-run");
    });
  });

  describe("Apple Silicon (unified memory)", () => {
    const hw = makeHW({ isAppleSilicon: true, totalUsableRAM: 36 });

    it("can-run when model fits in ~52.5% of unified memory", () => {
      expect(evaluateModel(15, hw)).toBe("can-run");
    });

    it("tight between 52.5% and 75%", () => {
      expect(evaluateModel(25, hw)).toBe("tight");
    });

    it("cannot-run when exceeds 75%", () => {
      expect(evaluateModel(30, hw)).toBe("cannot-run");
    });
  });

  describe("mobile (Android)", () => {
    const hw = makeHW({ isMobile: true, platform: "Android", totalUsableRAM: 8 });

    it("can-run for small models", () => {
      expect(evaluateModel(2, hw)).toBe("can-run");
    });

    it("cannot-run for large models", () => {
      expect(evaluateModel(6, hw)).toBe("cannot-run");
    });
  });

  describe("mobile (iOS)", () => {
    const hw = makeHW({ isMobile: true, platform: "iOS", totalUsableRAM: 8 });

    it("uses stricter iOS factor (50% vs 55%)", () => {
      expect(evaluateModel(2, hw)).toBe("can-run");
      expect(evaluateModel(5, hw)).toBe("cannot-run");
    });
  });

  describe("fallback (no GPU, just RAM)", () => {
    const hw = makeHW({ totalUsableRAM: 16 });

    it("can-run when model fits comfortably in RAM", () => {
      expect(evaluateModel(6, hw)).toBe("can-run");
    });

    it("cannot-run when model exceeds usable RAM", () => {
      expect(evaluateModel(14, hw)).toBe("cannot-run");
    });
  });

  it("returns unknown when no memory info available", () => {
    const hw = makeHW({});
    expect(evaluateModel(8, hw)).toBe("unknown");
  });
});

// ── estimateTokensPerSecond ──────────────────────────────────

describe("estimateTokensPerSecond", () => {
  it("returns null without bandwidth info", () => {
    const hw = makeHW({});
    expect(estimateTokensPerSecond(8, hw)).toBeNull();
  });

  it("desktop GPU: bandwidth/modelSize * 0.70", () => {
    const hw = makeHW({ memoryBandwidth: 960, estimatedVRAM: 24 });
    const toks = estimateTokensPerSecond(8, hw)!;
    expect(toks).toBe(Math.round((960 / 8) * 0.70));
  });

  it("Apple Silicon: efficiency 0.65", () => {
    const hw = makeHW({ memoryBandwidth: 200, isAppleSilicon: true });
    const toks = estimateTokensPerSecond(8, hw)!;
    expect(toks).toBe(Math.round((200 / 8) * 0.65));
  });

  it("mobile: efficiency 0.40", () => {
    const hw = makeHW({ memoryBandwidth: 100, isMobile: true });
    const toks = estimateTokensPerSecond(4, hw)!;
    expect(toks).toBe(Math.round((100 / 4) * 0.40));
  });

  it("offloading path gives lower tok/s than full VRAM", () => {
    const hw = makeHW({ memoryBandwidth: 960, estimatedVRAM: 16, systemRAM: 64 });
    const fullVRAM = estimateTokensPerSecond(12, hw)!;
    const offloaded = estimateTokensPerSecond(24, hw)!;
    expect(offloaded).toBeLessThan(fullVRAM);
    expect(offloaded).toBeGreaterThan(0);
  });
});

// ── memoryPercentage ─────────────────────────────────────────

describe("memoryPercentage", () => {
  it("discrete GPU: % of VRAM", () => {
    const hw = makeHW({ estimatedVRAM: 16 });
    expect(memoryPercentage(8, hw)).toBe(50);
  });

  it("Apple Silicon: % of unified memory", () => {
    const hw = makeHW({ isAppleSilicon: true, totalUsableRAM: 32 });
    expect(memoryPercentage(16, hw)).toBe(50);
  });

  it("can exceed 100%", () => {
    const hw = makeHW({ estimatedVRAM: 8 });
    expect(memoryPercentage(12, hw)).toBe(150);
  });

  it("returns null when no memory info", () => {
    expect(memoryPercentage(8, makeHW({}))).toBeNull();
  });
});

// ── computeScore & scoreToGrade ──────────────────────────────

describe("computeScore", () => {
  it("returns 0 for cannot-run", () => {
    expect(computeScore("cannot-run", 50, 7)).toBe(0);
  });

  it("returns 0 for unknown", () => {
    expect(computeScore("unknown", null, 7)).toBe(0);
  });

  it("higher tok/s gives higher score", () => {
    const fast = computeScore("can-run", 80, 7, 30);
    const slow = computeScore("can-run", 10, 7, 80);
    expect(fast).toBeGreaterThan(slow);
  });

  it("can-run-slow applies 0.60 multiplier (lower than tight's 0.75)", () => {
    const tightScore = computeScore("tight", 20, 7, 50);
    const slowScore = computeScore("can-run-slow", 20, 7, 50);
    expect(slowScore).toBeLessThan(tightScore);
  });
});

describe("scoreToGrade", () => {
  it("cannot-run always gets F", () => {
    expect(scoreToGrade(100, "cannot-run")).toBe("F");
  });

  it("unknown always gets ?", () => {
    expect(scoreToGrade(100, "unknown")).toBe("?");
  });

  it("can-run-slow caps at C", () => {
    expect(scoreToGrade(90, "can-run-slow")).toBe("C");
  });

  it("can-run-slow with low score gets D", () => {
    expect(scoreToGrade(30, "can-run-slow")).toBe("D");
  });

  it("S grade for score >= 85", () => {
    expect(scoreToGrade(85, "can-run")).toBe("S");
  });

  it("A grade for score >= 70", () => {
    expect(scoreToGrade(70, "can-run")).toBe("A");
  });

  it("B grade for score >= 55", () => {
    expect(scoreToGrade(55, "can-run")).toBe("B");
  });

  it("F grade for very low score", () => {
    expect(scoreToGrade(5, "can-run")).toBe("F");
  });
});

// ── evaluateModelComplete ────────────────────────────────────

describe("evaluateModelComplete", () => {
  it("returns all fields", () => {
    const hw = makeHW({ estimatedVRAM: 24, memoryBandwidth: 1008 });
    const result = evaluateModelComplete(8, hw, 7);
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("toksPerSec");
    expect(result).toHaveProperty("memPct");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("grade");
  });

  it("RTX 5080 16GB + 64GB RAM — 18GB model gets can-run-slow", () => {
    const hw = makeHW({ estimatedVRAM: 16, memoryBandwidth: 960, systemRAM: 64 });
    const result = evaluateModelComplete(18.6, hw, 32);
    expect(result.status).toBe("can-run-slow");
    expect(["C", "D"]).toContain(result.grade);
  });

  it("RTX 4090 24GB — 8GB model runs great", () => {
    const hw = makeHW({ estimatedVRAM: 24, memoryBandwidth: 1008 });
    const result = evaluateModelComplete(8, hw, 14);
    expect(result.status).toBe("can-run");
    expect(["S", "A"]).toContain(result.grade);
  });
});

// ── applyOverrides ───────────────────────────────────────────

describe("applyOverrides", () => {
  const base = makeHW({
    estimatedVRAM: 16,
    systemRAM: 8,
    ramGB: 16,
    memoryBandwidth: 960,
  });

  it("returns base hw when no overrides", () => {
    const result = applyOverrides(base, {});
    expect(result.estimatedVRAM).toBe(16);
    expect(result.systemRAM).toBe(8);
  });

  it("overrides systemRAM", () => {
    const result = applyOverrides(base, { systemRAM: 64 });
    expect(result.systemRAM).toBe(64);
    expect(result.estimatedVRAM).toBe(16);
  });

  it("overrides ramGB and totalUsableRAM together", () => {
    const result = applyOverrides(base, { ramGB: 32 });
    expect(result.ramGB).toBe(32);
    expect(result.totalUsableRAM).toBe(32);
  });

  it("overrides multiple fields", () => {
    const result = applyOverrides(base, {
      ramGB: 24,
      systemRAM: 128,
      memoryBandwidth: 1008,
    });
    expect(result.ramGB).toBe(24);
    expect(result.systemRAM).toBe(128);
    expect(result.memoryBandwidth).toBe(1008);
  });
});

// ── getDeviceOverrides ───────────────────────────────────────

describe("getDeviceOverrides", () => {
  it("returns null for invalid key", () => {
    expect(getDeviceOverrides("invalid:foo")).toBeNull();
  });

  it("apple: returns correct Apple Silicon data", () => {
    const result = getDeviceOverrides("apple:m3 max");
    expect(result).not.toBeNull();
    expect(result!.isAppleSilicon).toBe(true);
    expect(result!.estimatedVRAM).toBeNull();
    expect(result!.ramGB).toBe(APPLE_DB["m3 max"].ram);
  });

  it("gpu: returns correct discrete GPU data", () => {
    const result = getDeviceOverrides("gpu:RTX 5000 Ada");
    expect(result).not.toBeNull();
    expect(result!.isAppleSilicon).toBe(false);
    expect(result!.estimatedVRAM).toBe(32);
    expect(result!.ramGB).toBe(32);
  });

  it("gpu: RTX 4090", () => {
    const result = getDeviceOverrides("gpu:RTX 4090");
    expect(result).not.toBeNull();
    expect(result!.estimatedVRAM).toBe(24);
  });

  it("mobile: returns mobile data", () => {
    const firstMobile = Object.keys(MOBILE_GPU_DB)[0];
    const result = getDeviceOverrides(`mobile:${firstMobile}`);
    expect(result).not.toBeNull();
    expect(result!.isMobile).toBe(true);
  });

  it("sbc: returns SBC data", () => {
    const firstSBC = Object.keys(SBC_DB)[0];
    const result = getDeviceOverrides(`sbc:${firstSBC}`);
    expect(result).not.toBeNull();
    expect(result!.estimatedVRAM).toBeNull();
  });
});

// ── buildSelectOptions ───────────────────────────────────────

describe("buildSelectOptions", () => {
  it("includes presets sorted", () => {
    const result = buildSelectOptions([16, 8, 32], null);
    expect(result).toEqual([8, 16, 32]);
  });

  it("adds detected value if not in presets", () => {
    const result = buildSelectOptions([8, 16, 32], 24);
    expect(result).toContain(24);
    expect(result).toEqual([8, 16, 24, 32]);
  });

  it("does not duplicate if detected is already in presets", () => {
    const result = buildSelectOptions([8, 16, 32], 16);
    expect(result).toEqual([8, 16, 32]);
  });

  it("ignores null/zero detected", () => {
    const result = buildSelectOptions([8, 16], null);
    expect(result).toEqual([8, 16]);
  });
});

// ── Integration: specific user scenarios ─────────────────────

describe("real-world scenarios", () => {
  it("RTX 5000 Ada 32GB user (Andres's bug)", () => {
    const gpu = matchGPU("NVIDIA RTX 5000 Ada Generation/PCIe/SSE2");
    expect(gpu).not.toBeNull();
    expect(gpu!.vram).toBe(32);
    expect(getGPUCategory("RTX 5000 Ada")).toBe("NVIDIA Pro");
  });

  it("RTX 5080 16GB + 64GB RAM — can offload a 32B Q4 model", () => {
    const hw = makeHW({ estimatedVRAM: 16, memoryBandwidth: 960, systemRAM: 64 });
    const qwen32bQ4 = 18.6;
    const result = evaluateModel(qwen32bQ4, hw);
    expect(result).toBe("can-run-slow");
  });

  it("M3 Max 128GB — big model fits in unified memory", () => {
    const hw = makeHW({ isAppleSilicon: true, totalUsableRAM: 128, memoryBandwidth: 408 });
    const result = evaluateModel(60, hw);
    expect(result).toBe("can-run");
  });

  it("GTX 1060 6GB — small model runs, big model doesn't", () => {
    const gpu = matchGPU("NVIDIA GeForce GTX 1060 6GB");
    expect(gpu).not.toBeNull();
    expect(gpu!.vram).toBe(6);

    const hw = makeHW({ estimatedVRAM: 6, memoryBandwidth: 192 });
    expect(evaluateModel(3, hw)).toBe("can-run");
    expect(evaluateModel(8, hw)).toBe("cannot-run");
  });
});
