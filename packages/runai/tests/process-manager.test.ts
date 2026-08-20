import { describe, expect, test } from "vitest";
import { parseDaemonPidFile } from "../src/commands/daemon";
import { isRunaiServeCommand } from "../src/process-manager";

describe("runai daemon process identity", () => {
  test("recognizes installed and source runai serve commands", () => {
    expect(isRunaiServeCommand("/opt/homebrew/bin/bun /app/runai/bin/runai serve --port 11435")).toBe(true);
    expect(isRunaiServeCommand("/usr/local/bin/runai api")).toBe(true);
    expect(isRunaiServeCommand("bun /app/runai/src/cli.ts serve")).toBe(true);
  });

  test("rejects unrelated listeners and misleading command lines", () => {
    expect(isRunaiServeCommand("python -m http.server 11435")).toBe(false);
    expect(isRunaiServeCommand("echo runai serve")).toBe(false);
    expect(isRunaiServeCommand("bun /app/other/server.ts serve")).toBe(false);
  });

  test("reads current and legacy PID files", () => {
    expect(parseDaemonPidFile('{"pid":123,"port":12000}')).toEqual({ pid: 123, port: 12000 });
    expect(parseDaemonPidFile("456")).toEqual({ pid: 456, port: 11435 });
    expect(parseDaemonPidFile('{"pid":0,"port":12000}')).toBeNull();
  });
});
