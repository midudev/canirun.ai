import * as p from "@clack/prompts";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { RUNAI_DEFAULT_PORT, RUNAI_DAEMON_PID_FILE, RUNAI_DAEMON_LOG_FILE } from "../config";
import { isApiServerActive, isPortInUse, stopApiServerOnPort } from "../process-manager";
import { getArgValue } from "../cli-utils";

interface DaemonPidFile {
  pid: number;
  port: number;
}

export function parseDaemonPidFile(content: string): DaemonPidFile | null {
  try {
    const parsed = JSON.parse(content) as Partial<DaemonPidFile>;
    if (
      Number.isInteger(parsed.pid)
      && (parsed.pid ?? 0) > 0
      && Number.isInteger(parsed.port)
      && (parsed.port ?? 0) > 0
    ) {
      return { pid: parsed.pid!, port: parsed.port! };
    }
  } catch {
    // Fall through to the legacy plain PID format.
  }
  if (/^\d+$/.test(content.trim())) {
    const legacyPid = Number.parseInt(content.trim(), 10);
    if (Number.isInteger(legacyPid) && legacyPid > 0) {
      return { pid: legacyPid, port: RUNAI_DEFAULT_PORT };
    }
  }
  return null;
}

export async function handleDaemon(args: string[]): Promise<void> {
  const modelArg = getArgValue(args, "--model");
  const portArg = getArgValue(args, "--port");
  const port = portArg ? Number(portArg) : RUNAI_DEFAULT_PORT;

  const active = await isApiServerActive(port);
  if (active) {
    p.log.warn(`API server already running on port ${port}`);
    return;
  }
  if (await isPortInUse(port)) {
    p.log.error(`Port ${port} is already used by another process.`);
    return;
  }

  const cliPath = process.argv[1];
  if (!cliPath) {
    p.log.error("Unable to resolve the installed runai entrypoint.");
    return;
  }
  const childArgs = [process.execPath, cliPath, "serve"];
  if (modelArg) childArgs.push("--model", modelArg);
  if (portArg) childArgs.push("--port", portArg);

  const proc = Bun.spawn(childArgs, {
    stdout: Bun.file(RUNAI_DAEMON_LOG_FILE),
    stderr: Bun.file(RUNAI_DAEMON_LOG_FILE),
    stdin: "ignore",
  });

  const pid = proc.pid;
  proc.unref();
  await writeFile(RUNAI_DAEMON_PID_FILE, JSON.stringify({ pid, port }));

  p.log.success(`runai daemon started (PID ${pid}) on port ${port}`);
  p.log.info(`Logs: ${RUNAI_DAEMON_LOG_FILE}`);
  p.log.info(`Stop with: runai stop`);
}

export async function handleStop(): Promise<void> {
  try {
    const pidContent = await readFile(RUNAI_DAEMON_PID_FILE, "utf-8");
    const daemon = parseDaemonPidFile(pidContent);

    if (!daemon) {
      p.log.error("Invalid PID file.");
      return;
    }

    const stopped = await stopApiServerOnPort(daemon.port, daemon.pid);
    if (stopped) {
      p.log.success(`Stopped runai daemon (PID ${daemon.pid})`);
    } else {
      p.log.warn(
        `PID ${daemon.pid} is not the verified runai server on port ${daemon.port}; no process was stopped.`,
      );
    }

    await unlink(RUNAI_DAEMON_PID_FILE).catch(() => {});
  } catch {
    const stopped = await stopApiServerOnPort(RUNAI_DEFAULT_PORT);
    if (stopped) {
      p.log.success("Stopped runai process on default port.");
    } else {
      p.log.warn("No runai daemon found to stop.");
    }
  }
}
