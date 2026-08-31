import { describe, expect, it } from "vitest";
import { models, getEvaluationOptions, isDiffusionModel } from "../src/data/models";
import {
  computeScore,
  evaluateModelComplete,
  scoreToGrade,
  type Grade,
  type HardwareInfo,
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

/** MacBook Air M4, 24 GB unified memory, 120 GB/s. */
const M4_AIR_24GB = makeHW({
  deviceName: "Apple M4",
  isAppleSilicon: true,
  totalUsableRAM: 24,
  ramGB: 24,
  memoryBandwidth: 120,
  gpuCores: 10,
});

/** RTX 4090, the card Alibaba names as the Wan 2.2 TI2V-5B floor. */
const RTX_4090 = makeHW({
  deviceName: "NVIDIA RTX 4090",
  estimatedVRAM: 24,
  systemRAM: 64,
  memoryBandwidth: 1008,
});

const diffusionModels = models.filter(isDiffusionModel);
const quantOf = (id: string, name: string) =>
  models.find((m) => m.id === id)!.quants.find((q) => q.name === name)!;

// ── Catalog wiring ───────────────────────────────────────────

describe("diffusion catalog", () => {
  it("tags every image and video generator with the diffusion profile", () => {
    const generators = models.filter(
      (m) => m.useCase.includes("image") || m.useCase.includes("video"),
    );
    expect(generators.length).toBeGreaterThan(0);
    for (const model of generators) {
      expect(model.memoryProfile, `${model.id} is a generator`).toBe("diffusion");
    }
  });

  it("leaves every other model on the autoregressive path", () => {
    for (const model of models) {
      if (model.useCase.includes("image") || model.useCase.includes("video")) continue;
      expect(isDiffusionModel(model), `${model.id} is an LLM`).toBe(false);
    }
  });

  it("keeps the resident companion weights in every quant level", () => {
    for (const model of diffusionModels) {
      const companion = model.companionWeightsGB ?? 0;
      for (const quant of model.quants) {
        // Weights alone can never explain the footprint: the text encoder, the
        // VAE and the activation peak survive quantizing the denoiser.
        expect(quant.vramGB, `${model.id} ${quant.name}`).toBeGreaterThan(companion);
      }
    }
  });

  it("orders quant levels monotonically", () => {
    for (const model of diffusionModels) {
      for (let i = 1; i < model.quants.length; i++) {
        expect(
          model.quants[i]!.vramGB,
          `${model.id} ${model.quants[i]!.name} vs ${model.quants[i - 1]!.name}`,
        ).toBeGreaterThan(model.quants[i - 1]!.vramGB);
      }
    }
  });
});

// ── The sourced anchor ───────────────────────────────────────

describe("Wan 2.2 TI2V-5B matches its published floor", () => {
  // Alibaba: "This command can run on a GPU with at least 24GB VRAM (e.g, RTX
  // 4090 GPU)" for 720p@24fps.
  // https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B
  const PUBLISHED_FLOOR_GB = 24;

  it("lands within a GB of the 24 GB the authors publish", () => {
    const q8 = quantOf("wan2.2-ti2v-5b", "Q8_0");
    expect(Math.abs(q8.vramGB - PUBLISHED_FLOOR_GB)).toBeLessThan(1);
  });

  it("no longer claims a 24 GB MacBook Air can run it", () => {
    const model = models.find((m) => m.id === "wan2.2-ti2v-5b")!;
    const q4 = quantOf("wan2.2-ti2v-5b", "Q4_K_M");
    const { status, grade } = evaluateModelComplete(
      q4.vramGB,
      M4_AIR_24GB,
      model.paramsBillions,
      getEvaluationOptions(model),
    );
    // 24 GB of unified memory, of which the engine treats 75% as usable, cannot
    // hold a pipeline whose own authors ask for 24 GB of dedicated VRAM.
    expect(status).toBe("cannot-run");
    expect(grade).toBe("F");
  });

  it("still fits the 4090 the authors name", () => {
    const model = models.find((m) => m.id === "wan2.2-ti2v-5b")!;
    const q4 = quantOf("wan2.2-ti2v-5b", "Q4_K_M");
    const { status, grade } = evaluateModelComplete(
      q4.vramGB,
      RTX_4090,
      model.paramsBillions,
      getEvaluationOptions(model),
    );
    // Sitting exactly on the published 24 GB floor: tight, but not "Too heavy".
    expect(status).toBe("tight");
    expect(grade).not.toBe("F");
  });
});

// ── Throughput ───────────────────────────────────────────────

describe("tokens/s is not reported for diffusion", () => {
  it("returns null for every diffusion model", () => {
    for (const model of diffusionModels) {
      const { toksPerSec } = evaluateModelComplete(
        model.quants[0]!.vramGB,
        RTX_4090,
        model.paramsBillions,
        getEvaluationOptions(model),
      );
      expect(toksPerSec, `${model.id}`).toBeNull();
    }
  });

  it("still reports it for autoregressive models", () => {
    const llm = models.find((m) => m.id === "qwen3-vl-8b")!;
    const { toksPerSec } = evaluateModelComplete(
      llm.quants[0]!.vramGB,
      RTX_4090,
      llm.paramsBillions,
      getEvaluationOptions(llm),
    );
    expect(toksPerSec).toBeGreaterThan(0);
  });

  it("grades on fit and headroom when speed is unavailable", () => {
    const model = models.find((m) => m.id === "wan2.2-ti2v-5b")!;
    const q4 = quantOf("wan2.2-ti2v-5b", "Q4_K_M");
    const { score } = evaluateModelComplete(
      q4.vramGB,
      RTX_4090,
      model.paramsBillions,
      getEvaluationOptions(model),
    );
    expect(score).toBeGreaterThan(0);
  });
});

// ── Regression guard ─────────────────────────────────────────

describe("autoregressive sizing is untouched", () => {
  it("keeps the known Qwen3-VL 8B quant table", () => {
    const q4 = quantOf("qwen3-vl-8b", "Q4_K_M");
    // params × 0.5 bytes × 1.1 + 0.5 GB runtime
    const expected = Math.round(((8.8e9 * 0.5) / 1024 ** 3 * 1.1 + 0.5) * 10) / 10;
    expect(q4.vramGB).toBe(expected);
  });

  it("defaults getEvaluationOptions to autoregressive", () => {
    const llm = models.find((m) => m.id === "qwen3-vl-8b")!;
    expect(getEvaluationOptions(llm).memoryProfile).toBe("autoregressive");
  });
});

// ── Grade ordering ───────────────────────────────────────────

describe("a tight fit never grades below an offloaded one", () => {
  // `tight` fits in memory; `can-run-slow` does not and falls back to system
  // RAM. The second is strictly worse, so it must never grade higher.
  const cases: Array<[number | null, number]> = [
    [8, 90],
    [null, 88],
    [3, 95],
  ];

  it("floors tight at D", () => {
    for (const [toks, memPct] of cases) {
      const score = computeScore("tight", toks, 5, memPct);
      expect(scoreToGrade(score, "tight"), `t/s=${toks} mem=${memPct}%`).not.toBe("F");
    }
  });

  it("keeps tight at or above can-run-slow", () => {
    const order: Grade[] = ["F", "D", "C", "B", "A", "S"];
    for (const [toks, memPct] of cases) {
      const tight = scoreToGrade(computeScore("tight", toks, 5, memPct), "tight");
      const slow = scoreToGrade(computeScore("can-run-slow", toks, 5, memPct), "can-run-slow");
      expect(order.indexOf(tight), `t/s=${toks} mem=${memPct}%`).toBeGreaterThanOrEqual(
        order.indexOf(slow),
      );
    }
  });

  it("leaves cannot-run at F", () => {
    expect(scoreToGrade(computeScore("cannot-run", 8, 5, 200), "cannot-run")).toBe("F");
  });
});
