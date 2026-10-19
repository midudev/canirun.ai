import { describe, expect, it } from "vitest";
import { models, getEvaluationOptions, getLicenseTier, isCommercialLicense } from "../src/data/models";
import { getLicenseByName } from "../src/data/licenses";
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
