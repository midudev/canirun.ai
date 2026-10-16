import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const BIN_SCRIPT = join(import.meta.dirname, "..", "bin", "runai");

describe("bin/runai", () => {
  let root: string;
  let cli: string;
  let script: string;
  let fakeBunDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "runai-bin-"));
    mkdirSync(join(root, "pkg", "bin"), { recursive: true });
    mkdirSync(join(root, "pkg", "dist"));
    script = join(root, "pkg", "bin", "runai");
    copyFileSync(BIN_SCRIPT, script);
    chmodSync(script, 0o755);
    cli = join(root, "pkg", "dist", "cli.js");
    writeFileSync(cli, "");

    // Stand-in for bun that prints the CLI path it was asked to run.
    fakeBunDir = join(root, "fake-bun");
    mkdirSync(fakeBunDir);
    writeFileSync(join(fakeBunDir, "bun"), '#!/bin/sh\nprintf "%s" "$1"\n');
    chmodSync(join(fakeBunDir, "bun"), 0o755);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function run(entry: string) {
    return spawnSync(entry, ["--version"], {
      encoding: "utf8",
      env: { PATH: `${fakeBunDir}:/usr/bin:/bin` },
    });
  }

  test("finds dist/cli.js when run directly", () => {
    const result = run(script);
    expect(result.status).toBe(0);
    expect(realpathSync(result.stdout)).toBe(realpathSync(cli));
  });

  test("finds dist/cli.js through an absolute symlink in another directory", () => {
    mkdirSync(join(root, "global-bin"));
    const link = join(root, "global-bin", "runai");
    symlinkSync(script, link);

    const result = run(link);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(realpathSync(result.stdout)).toBe(realpathSync(cli));
  });

  test("follows a chain of relative symlinks", () => {
    mkdirSync(join(root, "a"));
    mkdirSync(join(root, "b"));
    symlinkSync("../pkg/bin/runai", join(root, "a", "runai"));
    symlinkSync("../a/runai", join(root, "b", "runai"));

    const result = run(join(root, "b", "runai"));
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(realpathSync(result.stdout)).toBe(realpathSync(cli));
  });
});
