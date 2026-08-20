import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearHfResolutionCaches,
  getRepoFromModelUrl,
  pickBestGGUFFile,
  resolveHfGGUFDownload,
} from "../src/install";
import { parseContentRangeTotal } from "../src/pull";

describe("GGUF source resolution", () => {
  beforeEach(() => {
    clearHfResolutionCaches();
    vi.restoreAllMocks();
  });

  test("extracts a Hugging Face repository from a model URL", () => {
    expect(
      getRepoFromModelUrl("https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF"),
    ).toBe("lmstudio-community/Qwen3.5-4B-GGUF");
  });

  test("rejects unsupported model hosts", () => {
    expect(() => getRepoFromModelUrl("https://example.com/model.gguf")).toThrow(
      "Only Hugging Face is supported",
    );
  });

  test("chooses the requested quant and ignores projectors", () => {
    expect(
      pickBestGGUFFile(
        [
          "mmproj-model-f16.gguf",
          "model-Q5_K_M.gguf",
          "model-Q4_K_M.gguf",
        ],
        "Q4_K_M",
      ),
    ).toBe("model-Q4_K_M.gguf");
  });

  test("prioritizes curated repos and caches metadata and file size", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "content-length": String(4 * 1024 ** 3) },
        });
      }
      if (url.endsWith("/api/models/Qwen/Qwen3-8B-GGUF")) {
        return Response.json({
          id: "Qwen/Qwen3-8B-GGUF",
          siblings: [{ rfilename: "qwen3-8b-Q4_K_M.gguf" }],
        });
      }
      return new Response(null, { status: 404 });
    });
    const model = {
      id: "qwen3-8b",
      name: "Qwen 3 8B",
      sourceUrl: "https://huggingface.co/Qwen/Qwen3-8B",
      ggufRepo: "Qwen/Qwen3-8B-GGUF",
      quant: "Q4_K_M",
    };

    const first = await resolveHfGGUFDownload(model);
    const second = await resolveHfGGUFDownload(model);

    expect(first.repo).toBe("Qwen/Qwen3-8B-GGUF");
    expect(second).toEqual(first);
    expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/api/models/Qwen/Qwen3-8B-GGUF")
    )).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "HEAD")).toHaveLength(1);
  });
});

describe("resumable downloads", () => {
  test("reads the total size from a valid content range", () => {
    expect(parseContentRangeTotal("bytes 1024-2047/4096")).toBe(4096);
  });

  test("rejects malformed and wildcard content ranges", () => {
    expect(parseContentRangeTotal("bytes */4096")).toBeNull();
    expect(parseContentRangeTotal("invalid")).toBeNull();
    expect(parseContentRangeTotal(null)).toBeNull();
  });
});
