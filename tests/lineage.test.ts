import { describe, expect, it } from "vitest";
import {
  getLineageCurrent,
  getLineageSuccessor,
  isCurrentInLineage,
  models,
  type LineageFields,
} from "@canirun/models";

function model(fields: LineageFields): LineageFields {
  return fields;
}

describe("lineage helpers", () => {
  const older = model({
    id: "qwen-old",
    lineage: "qwen-dense-27b",
    releaseDate: "2026-04",
    paramsBillions: 27,
  });
  const newer = model({
    id: "qwen-new",
    lineage: "qwen-dense-27b",
    releaseDate: "2026-08",
    paramsBillions: 27,
  });
  const unique = model({
    id: "one-off",
    releaseDate: "2024-01",
    paramsBillions: 8,
  });

  it("picks the newest releaseDate in a lineage", () => {
    const current = getLineageCurrent([older, newer]);
    expect(current.get("qwen-dense-27b")?.id).toBe("qwen-new");
  });

  it("treats models without lineage as current", () => {
    expect(isCurrentInLineage(unique, [older, newer, unique])).toBe(true);
    expect(getLineageSuccessor(unique, [older, newer, unique])).toBeNull();
  });

  it("returns the successor only for superseded models", () => {
    const catalog = [older, newer];
    expect(isCurrentInLineage(older, catalog)).toBe(false);
    expect(isCurrentInLineage(newer, catalog)).toBe(true);
    expect(getLineageSuccessor(older, catalog)?.id).toBe("qwen-new");
    expect(getLineageSuccessor(newer, catalog)).toBeNull();
  });

  it("breaks ties with params then id", () => {
    const a = model({
      id: "a",
      lineage: "same",
      releaseDate: "2026-01",
      paramsBillions: 10,
    });
    const b = model({
      id: "b",
      lineage: "same",
      releaseDate: "2026-01",
      paramsBillions: 12,
    });
    expect(getLineageCurrent([a, b]).get("same")?.id).toBe("b");
  });
});

describe("catalog lineages", () => {
  it("keeps only GLM-5.3 current in glm-frontier", () => {
    const glm5 = models.find((m) => m.id === "glm-5");
    const glm51 = models.find((m) => m.id === "glm-5.1");
    const glm52 = models.find((m) => m.id === "glm-5.2");
    const glm53 = models.find((m) => m.id === "glm-5.3");
    expect(glm5 && isCurrentInLineage(glm5, models)).toBe(false);
    expect(glm51 && isCurrentInLineage(glm51, models)).toBe(false);
    expect(glm52 && isCurrentInLineage(glm52, models)).toBe(false);
    expect(glm53 && isCurrentInLineage(glm53, models)).toBe(true);
    expect(glm5 && getLineageSuccessor(glm5, models)?.id).toBe("glm-5.3");
    expect(glm52 && getLineageSuccessor(glm52, models)?.id).toBe("glm-5.3");
  });

  it("supersedes Qwen 3.6 27B when Qwen 3.8 27B is in the catalog", () => {
    const older = models.find((m) => m.id === "qwen3.6-27b");
    const newer = models.find((m) => m.id === "qwen3.8-27b");
    expect(older && isCurrentInLineage(older, models)).toBe(false);
    expect(newer && isCurrentInLineage(newer, models)).toBe(true);
    expect(older && getLineageSuccessor(older, models)?.id).toBe("qwen3.8-27b");
  });

  it("hides Qwen 3 Coder 30B-A3B behind Qwen 3.8 27B", () => {
    const coder = models.find((m) => m.id === "qwen3-coder-30b");
    const qwen38 = models.find((m) => m.id === "qwen3.8-27b");
    expect(coder && isCurrentInLineage(coder, models)).toBe(false);
    expect(qwen38 && isCurrentInLineage(qwen38, models)).toBe(true);
    expect(coder && getLineageSuccessor(coder, models)?.id).toBe("qwen3.8-27b");
  });

  it("does not exclude models without a lineage", () => {
    const qwen8 = models.find((m) => m.id === "qwen3-8b");
    expect(qwen8?.lineage).toBeUndefined();
    expect(qwen8 && isCurrentInLineage(qwen8, models)).toBe(true);
  });
});
