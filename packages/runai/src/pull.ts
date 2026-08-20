import { createWriteStream, existsSync } from "node:fs";
import { rename, stat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";
import { ensureModelDir, modelPathFromUrl } from "./model-store";

const ANSI = {
  reset: "\u001b[0m",
  cyan: "\u001b[36m",
  yellow: "\u001b[33m",
  hideCursor: "\u001b[?25l",
  showCursor: "\u001b[?25h",
};

const BYTES_FIELD_WIDTH = 20;
const SPEED_FIELD_WIDTH = 12;
const DOWNLOAD_RETRIES = 3;
const MIN_FREE_SPACE_BUFFER = 64 * 1024 * 1024;

function paint(text: string, color: string): string {
  if (!process.stdout.isTTY) return text;
  return `${color}${text}${ANSI.reset}`;
}

function waveGradient(text: string, phase: number): string {
  if (!process.stdout.isTTY) return text;
  const chars = [...text];
  return chars.map((ch, index) => {
    // Animated yellow-orange wave. Keeps high contrast while moving over time.
    const t = (index + phase) * 0.55;
    const mix = (Math.sin(t) + 1) / 2; // 0..1
    const r = Math.round(245 + (255 - 245) * mix);
    const g = Math.round(165 + (235 - 165) * mix);
    const b = Math.round(40 + (120 - 40) * mix);
    return `\u001b[38;2;${r};${g};${b}m${ch}`;
  }).join("") + ANSI.reset;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx < 2 ? 0 : 1)} ${units[idx]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatBar(percent: number, width = 28): string {
  const safe = clampPercent(percent);
  const filled = Math.round((safe / 100) * width);
  const empty = width - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}

export function renderTwoLineBlock(line1: string, line2: string, hasRendered: boolean): boolean {
  if (!process.stdout.isTTY) return hasRendered;
  if (!hasRendered) {
    process.stdout.write(`${line1}\n${line2}`);
    return true;
  }
  process.stdout.write("\r\u001b[2K\u001b[1A\r\u001b[2K");
  process.stdout.write(`${line1}\n${line2}`);
  return true;
}

export function clearTwoLineBlock(hasRendered: boolean): void {
  if (!process.stdout.isTTY || !hasRendered) return;
  process.stdout.write("\r\u001b[2K\u001b[1A\r\u001b[2K\r");
}

export function setCursorVisible(visible: boolean): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(visible ? ANSI.showCursor : ANSI.hideCursor);
}

export function parseContentRangeTotal(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^bytes\s+\d+-\d+\/(\d+)$/i);
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isFinite(total) && total >= 0 ? total : null;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000);
  }
  return Math.min(500 * (2 ** attempt), 4_000);
}

async function assertEnoughDiskSpace(targetPath: string, remainingBytes: number): Promise<void> {
  if (!Number.isFinite(remainingBytes) || remainingBytes <= 0) return;
  try {
    const fsInfo = await statfs(dirname(targetPath));
    const available = Number(fsInfo.bavail) * Number(fsInfo.bsize);
    const required = remainingBytes + MIN_FREE_SPACE_BUFFER;
    if (Number.isFinite(available) && available < required) {
      throw new Error(
        `Not enough disk space. Need ${formatBytes(required)}, but only ${formatBytes(available)} is available.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Not enough disk space")) throw error;
    // Some filesystems/runtimes do not expose statfs. Downloading can still proceed.
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDownload(url: string, offset: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DOWNLOAD_RETRIES; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
        redirect: "follow",
      });
      if (response.ok || response.status === 416) return response;
      if (!isRetryableStatus(response.status) || attempt === DOWNLOAD_RETRIES) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      lastError = new Error(`Download failed: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (
        attempt === DOWNLOAD_RETRIES
        || (error instanceof Error && error.message.startsWith("Download failed: 4"))
      ) {
        throw error;
      }
    }
    await response?.body?.cancel().catch(() => {});
    await sleep(retryDelayMs(attempt, response));
  }
  throw lastError instanceof Error ? lastError : new Error("Download failed");
}

export async function pullModel(url: string, explicitName?: string, label = "download"): Promise<string> {
  await ensureModelDir();
  const targetPath = modelPathFromUrl(url, explicitName);
  const tempPath = `${targetPath}.part`;

  if (existsSync(targetPath)) {
    const existing = await stat(targetPath);
    if (existing.size > 0) return targetPath;
  }

  let downloaded = existsSync(tempPath) ? (await stat(tempPath)).size : 0;
  let total = 0;
  let lastUpdate = 0;
  let lastPercentPrinted = -1;
  let spinnerTick = 0;
  let lastSampleTime = Date.now();
  let lastSampleBytes = downloaded;
  let speedBps = 0;
  let renderedTwoLineBlock = false;
  let gradientPhase = 0;
  const spinnerFrames = ["◐", "◓", "◑", "◒"];
  let cursorHidden = false;

  try {
    if (process.stdout.isTTY) {
      setCursorVisible(false);
      cursorHidden = true;
    }

    let completed = false;
    for (let attempt = 0; attempt <= DOWNLOAD_RETRIES && !completed; attempt += 1) {
      const response = await fetchDownload(url, downloaded);
      const rangeTotal = parseContentRangeTotal(response.headers.get("content-range"));

      if (response.status === 416) {
        const remoteTotalMatch = response.headers.get("content-range")?.match(/\*\/(\d+)$/);
        const remoteTotal = remoteTotalMatch ? Number(remoteTotalMatch[1]) : 0;
        if (remoteTotal > 0 && downloaded === remoteTotal) {
          total = remoteTotal;
          completed = true;
          break;
        }
        throw new Error("The partial download cannot be resumed because the remote file changed.");
      }

      if (!response.body) throw new Error("Download failed: empty response body");

      const isResumed = downloaded > 0 && response.status === 206;
      if (downloaded > 0 && !isResumed) downloaded = 0;
      const contentLength = Number(response.headers.get("content-length") || "0");
      total = rangeTotal ?? (contentLength > 0 ? downloaded + contentLength : 0);
      await assertEnoughDiskSpace(targetPath, total > 0 ? total - downloaded : 0);

      const file = createWriteStream(tempPath, { flags: isResumed ? "a" : "w" });
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            completed = true;
            break;
          }
          if (!value) continue;
          downloaded += value.length;
          if (!file.write(Buffer.from(value))) await once(file, "drain");
          const now = Date.now();
          if (now - lastUpdate < 80) continue;
          lastUpdate = now;
          const elapsedMs = now - lastSampleTime;
          if (elapsedMs > 0) {
            const deltaBytes = downloaded - lastSampleBytes;
            const instantBps = (deltaBytes / elapsedMs) * 1000;
            speedBps = speedBps > 0 ? (speedBps * 0.7) + (instantBps * 0.3) : instantBps;
            lastSampleTime = now;
            lastSampleBytes = downloaded;
          }
          if (total > 0) {
            const pct = clampPercent((downloaded / total) * 100);
            if (pct !== lastPercentPrinted || process.stdout.isTTY) {
              lastPercentPrinted = pct;
              if (process.stdout.isTTY) {
                const bar = formatBar(pct);
                const pctLabel = `${String(pct).padStart(3, " ")}%`;
                const bytesText = `${formatBytes(downloaded)}/${formatBytes(total)}`.padEnd(BYTES_FIELD_WIDTH, " ");
                const speedText = formatSpeed(speedBps).padEnd(SPEED_FIELD_WIDTH, " ");
                const line1 = `✓ Installing ${label} [${bar}] ${pctLabel}`;
                const line2 = `${paint("⛁", ANSI.cyan)} ${paint(bytesText, ANSI.cyan)}  ${waveGradient(`⚡ ${speedText}`, gradientPhase)}`;
                gradientPhase += 1;
                renderedTwoLineBlock = renderTwoLineBlock(line1, line2, renderedTwoLineBlock);
              } else if (pct % 10 === 0) {
                console.log(
                  `Installing ${label} (${pct}%) ${formatBytes(downloaded)}/${formatBytes(total)} ${formatSpeed(speedBps)}`,
                );
              }
            }
          } else {
            spinnerTick += 1;
            const frame = spinnerFrames[spinnerTick % spinnerFrames.length];
            if (process.stdout.isTTY) {
              const bytesText = formatBytes(downloaded).padEnd(BYTES_FIELD_WIDTH, " ");
              const speedText = formatSpeed(speedBps).padEnd(SPEED_FIELD_WIDTH, " ");
              const line1 = `${frame} Installing ${label}`;
              const line2 = `${paint("⛁", ANSI.cyan)} ${paint(bytesText, ANSI.cyan)}  ${waveGradient(`⚡ ${speedText}`, gradientPhase)}`;
              gradientPhase += 1;
              renderedTwoLineBlock = renderTwoLineBlock(line1, line2, renderedTwoLineBlock);
            } else if (downloaded % (5 * 1024 * 1024) < value.length) {
              console.log(`Installing ${label} ${formatBytes(downloaded)} ${formatSpeed(speedBps)}`);
            }
          }
        }
      } catch (error) {
        completed = false;
        if (attempt === DOWNLOAD_RETRIES) throw error;
        await sleep(retryDelayMs(attempt));
      } finally {
        await new Promise<void>((resolve, reject) => {
          file.once("error", reject);
          file.end(() => resolve());
        });
      }
    }

    const partial = await stat(tempPath);
    if (!completed || (total > 0 && partial.size !== total)) {
      throw new Error(
        `Download incomplete: received ${formatBytes(partial.size)}${total > 0 ? ` of ${formatBytes(total)}` : ""}. Run the command again to resume.`,
      );
    }

    await rename(tempPath, targetPath);
    const details = await stat(targetPath);
    if (process.stdout.isTTY) {
      const bar = formatBar(100);
      const pctLabel = "100%";
      const bytesText = `${formatBytes(details.size)}/${formatBytes(details.size)}`.padEnd(BYTES_FIELD_WIDTH, " ");
      const speedText = formatSpeed(speedBps).padEnd(SPEED_FIELD_WIDTH, " ");
      const line1 = `✓ Installing ${label} [${bar}] ${pctLabel}`;
      const line2 = `${paint("⛁", ANSI.cyan)} ${paint(bytesText, ANSI.cyan)}  ${waveGradient(`⚡ ${speedText}`, gradientPhase)}`;
      renderedTwoLineBlock = renderTwoLineBlock(line1, line2, renderedTwoLineBlock);
    }
    console.log(`Installed ${label} (${formatBytes(details.size)})`);
    return targetPath;
  } catch (error) {
    throw error;
  } finally {
    clearTwoLineBlock(renderedTwoLineBlock);
    if (cursorHidden) setCursorVisible(true);
  }
}
