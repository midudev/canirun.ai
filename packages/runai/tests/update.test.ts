import { describe, expect, test } from "vitest";
import {
  fetchLatestVersion,
  isCacheFresh,
  isSourceCheckout,
  isVersionNewer,
  normalizeVersionTag,
  parseGitHubLatest,
  parseNpmLatest,
  parseSemver,
} from "../src/update";

describe("normalizeVersionTag", () => {
  test("strips v, runai-, and runai-v prefixes", () => {
    expect(normalizeVersionTag("0.2.1")).toBe("0.2.1");
    expect(normalizeVersionTag("v0.2.1")).toBe("0.2.1");
    expect(normalizeVersionTag("runai-0.2.1")).toBe("0.2.1");
    expect(normalizeVersionTag("runai-v0.2.1")).toBe("0.2.1");
  });
});

describe("parseSemver / isVersionNewer", () => {
  test("parses major.minor.patch", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("nope")).toBeNull();
  });

  test("detects a newer latest version", () => {
    expect(isVersionNewer("0.3.0", "0.2.1")).toBe(true);
    expect(isVersionNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isVersionNewer("0.2.1", "0.2.1")).toBe(false);
    expect(isVersionNewer("0.2.0", "0.2.1")).toBe(false);
  });
});

describe("isCacheFresh", () => {
  test("treats a recent check as fresh", () => {
    expect(isCacheFresh({ checkedAt: 1_000, latestVersion: "0.3.0" }, 1_000 + 60_000, 86_400_000)).toBe(true);
  });

  test("treats an expired check as stale", () => {
    expect(isCacheFresh({ checkedAt: 1_000, latestVersion: "0.3.0" }, 1_000 + 86_400_001, 86_400_000)).toBe(false);
  });
});

describe("remote payload parsers", () => {
  test("reads npm latest.version", () => {
    expect(parseNpmLatest({ version: "0.3.0" })).toBe("0.3.0");
    expect(parseNpmLatest({ version: "nope" })).toBeNull();
    expect(parseNpmLatest(null)).toBeNull();
  });

  test("reads GitHub release tag_name", () => {
    expect(parseGitHubLatest({ tag_name: "v0.3.0" })).toBe("0.3.0");
    expect(parseGitHubLatest({ tag_name: "runai-v0.3.0" })).toBe("0.3.0");
    expect(parseGitHubLatest({ tag_name: "nightly" })).toBeNull();
  });
});

describe("isSourceCheckout", () => {
  test("detects a packages/runai source entrypoint", () => {
    expect(isSourceCheckout("/Users/me/canirun.ai/packages/runai/src/cli.ts")).toBe(true);
    expect(isSourceCheckout("/opt/pnpm/global/5/.pnpm/runai@0.2.1/node_modules/runai/dist/cli.js")).toBe(false);
  });
});

describe("fetchLatestVersion", () => {
  test("uses npm when it returns a version", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("registry.npmjs.org")) {
        return new Response(JSON.stringify({ version: "0.4.0" }), { status: 200 });
      }
      return new Response("missing", { status: 404 });
    };
    await expect(fetchLatestVersion({ fetchImpl: fetchImpl as typeof fetch })).resolves.toBe("0.4.0");
  });

  test("falls back to GitHub when npm is unavailable", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("github.com")) {
        return new Response(JSON.stringify({ tag_name: "runai-v0.5.0" }), { status: 200 });
      }
      return new Response("down", { status: 503 });
    };
    await expect(fetchLatestVersion({ fetchImpl: fetchImpl as typeof fetch })).resolves.toBe("0.5.0");
  });

  test("returns null when both sources fail", async () => {
    const fetchImpl = async () => new Response("down", { status: 503 });
    await expect(fetchLatestVersion({ fetchImpl: fetchImpl as typeof fetch })).resolves.toBeNull();
  });
});
