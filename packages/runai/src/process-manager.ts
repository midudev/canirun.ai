import { createConnection } from "node:net";
import { basename } from "node:path";
import { RUNAI_DEFAULT_PORT } from "./config";

export interface ApiServerIdentity {
  pid: number;
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 400);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getApiServerIdentity(
  port = RUNAI_DEFAULT_PORT,
): Promise<ApiServerIdentity | null> {
  const response = await fetchWithTimeout(`http://127.0.0.1:${port}/health`);
  if (!response?.ok) return null;
  try {
    const payload = await response.json() as {
      ok?: boolean;
      service?: string;
      pid?: number;
    };
    if (
      payload.ok !== true
      || payload.service !== "runai"
      || !Number.isInteger(payload.pid)
      || (payload.pid ?? 0) <= 0
    ) {
      return null;
    }
    return { pid: payload.pid! };
  } catch {
    return null;
  }
}

export async function isApiServerActive(port = RUNAI_DEFAULT_PORT): Promise<boolean> {
  return (await getApiServerIdentity(port)) !== null;
}

export async function isPortInUse(port = RUNAI_DEFAULT_PORT): Promise<boolean> {
  return await new Promise((resolve) => {
    let settled = false;
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
    socket.setTimeout(300, () => finish(false));
  });
}

function splitCommandLine(command: string): string[] {
  return command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
    ?.map((part) => part.replace(/^(['"])(.*)\1$/, "$2")) ?? [];
}

export function isRunaiServeCommand(command: string): boolean {
  const parts = splitCommandLine(command);
  const commandIndex = parts.findIndex((part) => part === "serve" || part === "api");
  if (commandIndex < 1) return false;

  const entrypoint = parts[commandIndex - 1]!;
  const normalizedEntrypoint = entrypoint.replaceAll("\\", "/");
  const isEntrypoint = basename(normalizedEntrypoint) === "runai"
    || normalizedEntrypoint.endsWith("/bin/runai")
    || normalizedEntrypoint.endsWith("/dist/cli.js")
    || normalizedEntrypoint.endsWith("/src/cli.ts");
  if (!isEntrypoint) return false;

  if (commandIndex === 1) return true;
  const runtime = basename(parts[0]!.replaceAll("\\", "/"));
  return runtime === "bun" && parts.slice(1, commandIndex - 1).every((part) => part.startsWith("-"));
}

export function getProcessCommandLine(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const result = Bun.spawnSync(["ps", "-p", String(pid), "-o", "command="]);
  if (result.exitCode !== 0) return null;
  const command = new TextDecoder().decode(result.stdout).trim();
  return command || null;
}

export function isRunaiServerProcess(pid: number): boolean {
  const command = getProcessCommandLine(pid);
  return command !== null && isRunaiServeCommand(command);
}

function getListeningPids(port: number): number[] {
  const result = Bun.spawnSync([
    "lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t",
  ]);
  if (result.exitCode !== 0) return [];
  return new TextDecoder().decode(result.stdout)
    .split("\n")
    .map((value) => Number(value.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

export async function stopApiServerOnPort(
  port = RUNAI_DEFAULT_PORT,
  expectedPid?: number,
): Promise<boolean> {
  const identity = await getApiServerIdentity(port);
  if (!identity || (expectedPid !== undefined && identity.pid !== expectedPid)) {
    return false;
  }
  if (!getListeningPids(port).includes(identity.pid)) return false;
  if (!isRunaiServerProcess(identity.pid)) return false;

  try {
    process.kill(identity.pid, "SIGTERM");
  } catch {
    return false;
  }

  await Bun.sleep(350);
  const remaining = await getApiServerIdentity(port);
  if (!remaining) return true;
  if (
    remaining.pid !== identity.pid
    || !getListeningPids(port).includes(remaining.pid)
    || !isRunaiServerProcess(remaining.pid)
  ) {
    return false;
  }

  try {
    process.kill(remaining.pid, "SIGKILL");
  } catch {
    return false;
  }

  await Bun.sleep(200);
  return (await getApiServerIdentity(port)) === null;
}
