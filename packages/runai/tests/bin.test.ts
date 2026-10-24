import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const BIN_SCRIPT = join(import.meta.dirname, "..", "bin", "runai");
const PACKAGE_INSTALL_SCRIPT = join(import.meta.dirname, "..", "install", "install.sh");
const PUBLIC_INSTALL_SCRIPT = join(import.meta.dirname, "..", "..", "..", "public", "runai", "install.sh");

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

describe("install/install.sh", () => {
  test("keeps the package and public installer scripts in sync", () => {
    expect(readFileSync(PACKAGE_INSTALL_SCRIPT, "utf8")).toBe(
      readFileSync(PUBLIC_INSTALL_SCRIPT, "utf8"),
    );
  });

  test("silences the npm 404 on GitHub fallback and preserves piped script lines", () => {
    const root = mkdtempSync(join(tmpdir(), "runai-install-"));
    try {
      const home = join(root, "home");
      const binDir = join(root, "bin");
      const pnpmBinDir = join(home, ".local", "share", "pnpm", "bin");
      const checkoutBin = join(home, ".local", "share", "runai", "src", "packages", "runai", "bin");
      mkdirSync(binDir, { recursive: true });
      mkdirSync(pnpmBinDir, { recursive: true });
      mkdirSync(join(home, ".local", "share", "runai", "src", ".git"), { recursive: true });
      mkdirSync(checkoutBin, { recursive: true });

      writeFileSync(join(binDir, "bun"), "#!/bin/sh\nexit 0\n");
      chmodSync(join(binDir, "bun"), 0o755);

      writeFileSync(join(binDir, "git"), "#!/bin/sh\ncat >/dev/null\nexit 0\n");
      chmodSync(join(binDir, "git"), 0o755);

      writeFileSync(
        join(binDir, "pnpm"),
        [
          "#!/bin/sh",
          'if [ "$1" = "bin" ] && [ "$2" = "--global" ]; then',
          `  printf '%s\\n' "${pnpmBinDir}"`,
          "  exit 0",
          "fi",
          'if [ "$1" = "add" ]; then',
          '  echo "[ERR_PNPM_FETCH_404] GET https://registry.npmjs.org/@canirun%2Frunai: Not Found - 404" >&2',
          "  exit 1",
          "fi",
          "cat >/dev/null",
          "exit 0",
          "",
        ].join("\n"),
      );
      chmodSync(join(binDir, "pnpm"), 0o755);

      // Simulate `runai doctor` attaching a reader to stdin when piped into bash.
      writeFileSync(
        join(checkoutBin, "runai"),
        "#!/bin/sh\ncat >/dev/null\necho 'Doctor finished with warnings.'\n",
      );
      chmodSync(join(checkoutBin, "runai"), 0o755);

      const result = spawnSync("bash", [], {
        input: readFileSync(PACKAGE_INSTALL_SCRIPT, "utf8"),
        encoding: "utf8",
        env: {
          HOME: home,
          PATH: `${binDir}:/usr/bin:/bin`,
        },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain("ERR_PNPM_FETCH_404");
      expect(result.stdout).toContain("@canirun/runai is not on npm yet. Installing from GitHub instead...");
      expect(result.stdout).toContain("Doctor finished with warnings.");
      expect(result.stdout).toContain("Done.");
      expect(result.stdout).toContain("runai run qwen3.5-4b");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
