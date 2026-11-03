import { describe, expect, it } from "vitest";
import { models, getEvaluationOptions, getLicenseTier, getLineageSuccessor, isCommercialLicense, isCurrentInLineage } from "../src/data/models";
import { getLicenseByName } from "../src/data/licenses";
import { getCompanyByProvider } from "../src/data/companies";
import { matchesUseCategory } from "../src/lib/use-categories";
import { evaluateModelComplete, type HardwareInfo } from "../src/lib/hardware";

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

const RTX_4090 = makeHW({ deviceName: "NVIDIA RTX 4090", estimatedVRAM: 24, memoryBandwidth: 1008 });

describe("Nemotron 3.5 Bolt 74B-A9B", () => {
  const model = models.find((m) => m.id === "nemotron-3.5-bolt-74b-a9b")!;

  it("is in the catalog as a 74B MoE with 9B active", () => {
    expect(model).toBeDefined();
    expect(model.architecture).toBe("moe");
    expect(getEvaluationOptions(model).activeParamsBillions).toBe(9);
  });

  // NVIDIA packs the 2-bit checkpoint to stay "below 24 GB".
  // https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Bolt-74B-A9B-24GB
  it("runs at its lowest quant on the 24 GB card it is packed for", () => {
    const lowest = model.quants[0]!;
    const { status } = evaluateModelComplete(
      lowest.vramGB,
      RTX_4090,
      model.paramsBillions,
      getEvaluationOptions(model),
    );
    expect(status).not.toBe("cannot-run");
  });

  it("uses the permissive OpenMDW 1.1 license", () => {
    expect(getLicenseByName(model.license!)).toBeDefined();
    expect(getLicenseTier(model.license)).toBe("open");
    expect(isCommercialLicense(model.license)).toBe(true);
  });
});

function byId(id: string) {
  const model = models.find((m) => m.id === id);
  if (!model) throw new Error(`missing model ${id}`);
  return model;
}

describe("DeepSeek V4.1 Flash", () => {
  const model = byId("deepseek-v4.1-flash");

  // 552B backbone + 196B Engram memory, 763.2B in the checkpoint.
  // https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash
  it("is a 763B multimodal MoE with 16B active on decode", () => {
    expect(model.architecture).toBe("moe");
    expect(model.paramsBillions).toBe(763);
    expect(getEvaluationOptions(model).activeParamsBillions).toBe(16);
    expect(model.useCase).toContain("vision");
    expect(model.contextLength).toBe(1048576);
  });

  it("does not hide V4 Flash, which is far smaller", () => {
    const v4 = byId("deepseek-v4-flash");
    expect(v4.paramsBillions).toBe(284);
    expect(isCurrentInLineage(v4, models)).toBe(true);
  });
});

describe("new releases supersede their predecessors", () => {
  it.each([
    ["ornith-1.0-9b", "ornith-1.5-9b"],
    ["ornith-1.0-35b", "ornith-1.5-35b-a3b"],
    ["lfm2-24b", "lfm2.5-24b-a2b"],
    ["nemotron-nano-30b", "nemotron-3.5-lightning-30b-a3b"],
    ["minimax-m3", "minimax-m3.1-flash"],
  ])("%s -> %s", (older, newer) => {
    expect(getLineageSuccessor(byId(older), models)?.id).toBe(newer);
    expect(isCurrentInLineage(byId(newer), models)).toBe(true);
  });
});

describe("new licenses and companies", () => {
  it.each([
    ["qwen3.8-flash-next", "Qwen Community 1.0"],
    ["mistral-large-4", "Mistral Ecosystem"],
    ["muse-spark-open", "Muse"],
  ])("%s ships under %s, a commercial license with conditions", (id, license) => {
    const model = byId(id);
    expect(model.license).toBe(license);
    expect(getLicenseByName(license)).toBeDefined();
    expect(getLicenseTier(license)).toBe("partial");
    expect(isCommercialLicense(license)).toBe(true);
  });

  it.each([
    ["mimo-v2.6-flash", "xiaomi"],
    ["mellum-2.1-12b-a2.5b", "jetbrains"],
  ])("%s belongs to %s", (id, slug) => {
    expect(getCompanyByProvider(byId(id).provider)?.slug).toBe(slug);
  });
});

describe("decision models", () => {
  const ids = [
    "clef", "clef-flash", "clef-omni", "pplx-decider-v1.2", "pplx-decider-flash-v1.2",
    "d1-2b", "d1-omni-2b", "jev-35b", "jev-27b-vl", "laya",
  ];

  it.each(ids)("%s is listed under Decision, not as a chat or lightweight model", (id) => {
    const model = byId(id);
    expect(matchesUseCategory(model.useCase, model.paramsBillions, "decision")).toBe(true);
    expect(matchesUseCategory(model.useCase, model.paramsBillions, "text")).toBe(false);
    expect(matchesUseCategory(model.useCase, model.paramsBillions, "small")).toBe(false);
    expect(getCompanyByProvider(model.provider)).toBeDefined();
  });

  it("keeps small chat models in Lightweight", () => {
    const model = byId("lfm3-1.7b");
    expect(matchesUseCategory(model.useCase, model.paramsBillions, "small")).toBe(true);
  });
});
