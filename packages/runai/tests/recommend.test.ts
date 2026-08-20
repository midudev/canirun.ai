import { describe, expect, test } from "vitest";
import { models } from "@canirun/models";
import {
  findCatalogMatches,
  findModelByName,
  inferenceParamsBillions,
  recommendTopModels,
  searchCatalog,
} from "../src/recommend";
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

  test("resolves canonical and Ollama-style model names", () => {
    expect(findModelByName("qwen3-8b", hw)?.id).toBe("qwen3-8b");
    expect(findModelByName("qwen3:8b", hw)?.id).toBe("qwen3-8b");
    expect(findModelByName("qwen3-8b", hw)?.ggufRepo).toBe("Qwen/Qwen3-8B-GGUF");
  });

  test("uses active experts for MoE inference cost", () => {
    const moe = models.find((model) => model.id === "qwen3-30b-a3b");
    const moeWithoutStructuredMetadata = models.find((model) => model.id === "agents-a1");
    const dense = models.find((model) => model.id === "qwen3-8b");
    expect(moe && inferenceParamsBillions(moe)).toBe(3.3);
    expect(moeWithoutStructuredMetadata && inferenceParamsBillions(moeWithoutStructuredMetadata)).toBe(3);
    expect(dense && inferenceParamsBillions(dense)).toBe(8);

    const recommendation = findModelByName("qwen3-30b-a3b", hw);
    expect(recommendation?.activeParamsBillions).toBe(3.3);
    expect(recommendation?.memoryNeededGB).toBeGreaterThan(10);
    expect(recommendation?.expectedTokensPerSec).toBeGreaterThan(50);
  });

  test("skips superseded lineage members in recommendations", () => {
    const ids = new Set(recommendTopModels(hw, 80).map((model) => model.id));
    expect(ids.has("qwen3-0.6b")).toBe(false);
    expect(ids.has("qwen3.5-0.8b")).toBe(true);
    expect(ids.has("qwen3-1.7b")).toBe(false);
    expect(ids.has("qwen3.5-2b")).toBe(true);
    expect(ids.has("qwen3-8b")).toBe(true);
  });

  test("empty catalog search skips superseded models", () => {
    const ids = new Set(searchCatalog("", hw, 80).map((model) => model.id));
    expect(ids.has("qwen3-0.6b")).toBe(false);
    expect(ids.has("qwen3.5-0.8b")).toBe(true);
  });

  test("findModelByName still resolves superseded models", () => {
    expect(findModelByName("qwen3-0.6b", hw)?.id).toBe("qwen3-0.6b");
    expect(findModelByName("qwen3-30b-a3b", hw)?.id).toBe("qwen3-30b-a3b");
  });

  test("named catalog search still finds superseded models", () => {
    const ids = searchCatalog("qwen3-0.6b", hw, 25).map((model) => model.id);
    expect(ids).toContain("qwen3-0.6b");
  });

  test("resolves human names, compact ids, and Hugging Face repos", () => {
    expect(findModelByName("Qwen 3.5 4B", hw)?.id).toBe("qwen3.5-4b");
    expect(findModelByName("qwen3.5 4b", hw)?.id).toBe("qwen3.5-4b");
    expect(findModelByName("qwen3.5:4b", hw)?.id).toBe("qwen3.5-4b");
    expect(findModelByName("Qwen/Qwen3-8B", hw)?.id).toBe("qwen3-8b");
    expect(findModelByName("qwen3.5-4", hw)?.id).toBe("qwen3.5-4b");
  });

  test("does not auto-pick a family name when several models match", () => {
    expect(findModelByName("qwen", hw)).toBeNull();
    expect(findModelByName("qwen3.5", hw)).toBeNull();
    const matches = findCatalogMatches("qwen3.5", hw, 12).map((item) => item.model.id);
    expect(matches).toContain("qwen3.5-4b");
    expect(matches).toContain("qwen3.5-9b");
    expect(matches.some((id) => id.startsWith("qwen3-"))).toBe(false);
  });
});
