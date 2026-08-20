import { homedir } from "node:os";
import { join } from "node:path";

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const RUNAI_MODEL_DIR = process.env.RUNAI_MODEL_DIR || join(homedir(), ".runai", "models");
export const RUNAI_HOME_DIR = process.env.RUNAI_HOME_DIR || join(homedir(), ".runai");
export const RUNAI_DB_PATH = process.env.RUNAI_DB_PATH || join(RUNAI_HOME_DIR, "runai.db");
export const RUNAI_DEFAULT_PORT = envNumber("RUNAI_PORT", 11435);
export const RUNAI_DEFAULT_MODEL = process.env.RUNAI_MODEL || "";
export const RUNAI_VERSION = "0.2.1";
export const RUNAI_TELEMETRY_ENDPOINT = process.env.RUNAI_TELEMETRY_ENDPOINT || "https://canirun.ai/api/runai/metrics";
export const RUNAI_TELEMETRY_DISABLED = process.env.RUNAI_TELEMETRY_DISABLED === "1";

export const RUNAI_KEEP_ALIVE_MS = Math.max(0, envNumber("RUNAI_KEEP_ALIVE", 300) * 1000);
export const RUNAI_MAX_QUEUE = Math.max(0, Math.floor(envNumber("RUNAI_MAX_QUEUE", 64)));
export const RUNAI_DEFAULT_MAX_TOKENS = Math.max(1, Math.floor(envNumber("RUNAI_MAX_TOKENS", 2048)));
export const RUNAI_CONTEXT_SIZE = Math.max(512, Math.floor(envNumber("RUNAI_CONTEXT_SIZE", 4096)));
export const RUNAI_HARDWARE_CACHE_TTL_MS = Math.max(
  0,
  envNumber("RUNAI_HARDWARE_CACHE_TTL", 30) * 1000,
);
export const RUNAI_DAEMON_PID_FILE = join(RUNAI_HOME_DIR, "runai.pid");
export const RUNAI_DAEMON_LOG_FILE = join(RUNAI_HOME_DIR, "runai.log");
export const RUNAI_UPDATE_CACHE_PATH = join(RUNAI_HOME_DIR, "update-check.json");
export const RUNAI_UPDATE_CHECK_DISABLED = process.env.RUNAI_UPDATE_CHECK === "0";
export const RUNAI_UPDATE_CHECK_TTL_MS = Math.max(
  0,
  envNumber("RUNAI_UPDATE_CHECK_TTL", 86_400) * 1000,
);
export const RUNAI_NPM_LATEST_URL = process.env.RUNAI_NPM_LATEST_URL
  || "https://registry.npmjs.org/runai/latest";
export const RUNAI_GITHUB_RELEASES_URL = process.env.RUNAI_GITHUB_RELEASES_URL
  || "https://api.github.com/repos/midudev/canirun.ai/releases/latest";
export const OLLAMA_MODEL_DIR = process.env.OLLAMA_MODELS || join(homedir(), ".ollama", "models");

export const CHIP_BW_GBS: Record<string, number> = {
  "m1": 68,
  "m1 pro": 200,
  "m1 max": 400,
  "m1 ultra": 800,
  "m2": 100,
  "m2 pro": 200,
  "m2 max": 400,
  "m2 ultra": 800,
  "m3": 100,
  "m3 pro": 150,
  "m3 max": 400,
  "m3 ultra": 819,
  "m4": 120,
  "m4 pro": 273,
  "m4 max": 546,
  "m5": 153,
  "m5 pro": 307,
  "m5 max": 614,
};
