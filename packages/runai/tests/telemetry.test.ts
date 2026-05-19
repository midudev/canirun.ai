import { describe, expect, test } from "vitest";
import type { CliHardwareInfo, RecommendedModel } from "../src/types";
import {
  createBrowseTelemetryPayload,
  createInferenceTelemetryPayload,
  createRecommendationTelemetryPayload,
} from "../src/telemetry";

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
  deviceName: "MacBook Pro personal de Juan",
};

const recs: RecommendedModel[] = [
  {
    id: "qwen3-8b",
    name: "Qwen 3 8B",
    provider: "Alibaba",
    ollamaId: "qwen3:8b",
    quant: "Q4_K_M",
    score: 88,
    grade: "S",
    status: "can-run",
    expectedTokensPerSec: 48,
    memoryNeededGB: 5.2,
    diskNeededGB: 5.4,
    paramsBillions: 8,
    downloaded: false,
  },
];

describe("telemetry payloads", () => {
  test("recommendation payload excludes identifying device text", () => {
    const payload = createRecommendationTelemetryPayload(hw, recs);
    expect(payload.event).toBe("recommendation_generated");
    expect(payload.hardware.deviceClass).toBe("apple_silicon");
    expect(payload.hardware.ramBucketGB).toBe(24);
    expect(JSON.stringify(payload)).not.toContain("MacBook Pro personal de Juan");
  });

  test("browse payload sends only aggregate query data", () => {
    const payload = createBrowseTelemetryPayload("qwen code model", 12);
    expect(payload.queryLength).toBe(15);
    expect(payload.resultCount).toBe(12);
  });

  test("inference payload reports performance signals", () => {
    const payload = createInferenceTelemetryPayload({
      model: "qwen3-8b",
      stream: true,
      success: true,
      latencyMs: 1250.6,
      outputText: "hola mundo desde runai",
      temperature: 0.7,
      maxTokens: 256,
    });
    expect(payload.event).toBe("inference_completed");
    expect(payload.outputTokensApprox).toBe(4);
    expect(payload.latencyMs).toBe(1251);
  });
});
