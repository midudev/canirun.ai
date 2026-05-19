import { describe, expect, test } from "vitest";
import { recommendTopModels } from "../src/recommend";
import type { CliHardwareInfo } from "../src/types";

const hw: CliHardwareInfo = {
  gpuRenderer: "Apple M4",
  gpuVendor: "Apple",
  gpuCores: 10,
  ramGB: 24,
  estimatedVRAM: null,
  memoryBandwidth: 273,
  systemRAM: null,
  deviceMemoryRaw: null,
  webgpu: false,
  webgpuDevice: null,
  webgpuArch: "m4",
  isAppleSilicon: true,
  totalUsableRAM: 24,
  platform: "macOS",
  cpuBenchmark: 110,
  isMobile: false,
  deviceName: "Apple M4",
};

describe("recommendTopModels", () => {
  test("returns top 3 viable models", () => {
    const list = recommendTopModels(hw, 3);
    expect(list.length).toBe(3);
    expect(list[0]?.status).not.toBe("cannot-run");
    expect(list[0]?.memoryNeededGB).toBeGreaterThan(0);
  });
});
