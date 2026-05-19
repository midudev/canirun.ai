import { describe, expect, test } from "vitest";
import {
  getArgValue,
  hasFlag,
  positionalArgs,
  parseInstallTokens,
  stripGguf,
  normalizeModelId,
  estimateTokens,
  formatSeconds,
} from "../src/cli-utils";

describe("getArgValue", () => {
  test("returns value after flag", () => {
    expect(getArgValue(["--model", "qwen.gguf"], "--model")).toBe("qwen.gguf");
  });

  test("returns undefined when flag missing", () => {
    expect(getArgValue(["--port", "8080"], "--model")).toBeUndefined();
  });

  test("returns undefined when flag has no value", () => {
    expect(getArgValue(["--model"], "--model")).toBeUndefined();
  });

  test("returns undefined when next token is another flag", () => {
    expect(getArgValue(["--model", "--json"], "--model")).toBeUndefined();
  });
});

describe("hasFlag", () => {
  test("returns true when flag present", () => {
    expect(hasFlag(["--json", "--top", "3"], "--json")).toBe(true);
  });

  test("returns false when flag absent", () => {
    expect(hasFlag(["--top", "3"], "--json")).toBe(false);
  });
});

describe("positionalArgs", () => {
  test("extracts positional args ignoring flags", () => {
    const result = positionalArgs(["browse", "--limit", "10", "qwen"], ["--limit"]);
    expect(result).toEqual(["browse", "qwen"]);
  });

  test("returns empty for only flags", () => {
    const result = positionalArgs(["--json", "--top", "3"], ["--top"]);
    expect(result).toEqual([]);
  });

  test("returns all args when no flags", () => {
    const result = positionalArgs(["hello", "world"], []);
    expect(result).toEqual(["hello", "world"]);
  });
});

describe("parseInstallTokens", () => {
  test("splits comma-separated tokens", () => {
    expect(parseInstallTokens("1,2,3")).toEqual(["1", "2", "3"]);
  });

  test("trims whitespace", () => {
    expect(parseInstallTokens(" a , b , c ")).toEqual(["a", "b", "c"]);
  });

  test("filters empty strings", () => {
    expect(parseInstallTokens("a,,b")).toEqual(["a", "b"]);
  });
});

describe("stripGguf", () => {
  test("removes .gguf extension", () => {
    expect(stripGguf("model.gguf")).toBe("model");
  });

  test("handles case insensitive", () => {
    expect(stripGguf("model.GGUF")).toBe("model");
  });

  test("no-op when no .gguf", () => {
    expect(stripGguf("model")).toBe("model");
  });
});

describe("normalizeModelId", () => {
  test("strips path and .gguf", () => {
    expect(normalizeModelId("/home/user/.runai/models/Qwen3.5-4B.gguf")).toBe("qwen3.5-4b");
  });

  test("lowercases", () => {
    expect(normalizeModelId("MyModel")).toBe("mymodel");
  });
});

describe("estimateTokens", () => {
  test("counts words as approximate tokens", () => {
    expect(estimateTokens("hello world foo")).toBe(3);
  });

  test("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("   ")).toBe(0);
  });
});

describe("formatSeconds", () => {
  test("formats milliseconds as seconds", () => {
    expect(formatSeconds(1500)).toBe("1.50s");
    expect(formatSeconds(250)).toBe("0.25s");
  });
});
