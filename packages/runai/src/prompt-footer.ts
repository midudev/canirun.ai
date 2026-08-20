import { Writable } from "node:stream";

const ANSI = {
  saveCursor: "\u001b[s",
  restoreCursor: "\u001b[u",
  moveBottomLeft: "\u001b[999;1H",
  clearLine: "\u001b[2K",
  dim: "\u001b[2m",
  reset: "\u001b[0m",
  resetScrollRegion: "\u001b[r",
};

class StickyFooterOutput extends Writable {
  private footer = "";
  private readonly target: NodeJS.WriteStream;
  private footerPinned = false;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onResize = (): void => {
    if (!this.footer || !this.target.isTTY) return;
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.pinFooterSpace(true);
      this.renderFooter();
    }, 60);
  };

  get columns(): number { return this.target.columns; }
  get rows(): number { return this.target.rows; }

  constructor(target: NodeJS.WriteStream) {
    super();
    this.target = target;
    this.target.on("resize", this.onResize);
  }

  setFooter(text: string): void {
    this.footer = text;
    if (!this.footer) {
      this.unpinFooterSpace();
      return;
    }
    this.pinFooterSpace();
    this.renderFooter();
  }

  clearFooter(): void {
    if (!this.target.isTTY) return;
    this.footer = "";
    this.unpinFooterSpace();
    this.target.write(
      `${ANSI.saveCursor}${ANSI.moveBottomLeft}${ANSI.clearLine}${ANSI.restoreCursor}`,
    );
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.target.write(chunk, encoding, () => {
      this.renderFooter();
      callback();
    });
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.target.off("resize", this.onResize);
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    this.unpinFooterSpace();
    callback(error);
  }

  private pinFooterSpace(force = false): void {
    if (!this.target.isTTY || (this.footerPinned && !force)) return;
    const rows = this.target.rows || 24;
    if (rows < 2) return;
    this.target.write(
      `${ANSI.saveCursor}\u001b[1;${rows - 1}r${ANSI.restoreCursor}`,
    );
    this.footerPinned = true;
  }

  private unpinFooterSpace(): void {
    if (!this.target.isTTY || !this.footerPinned) return;
    this.target.write(`${ANSI.saveCursor}${ANSI.resetScrollRegion}${ANSI.restoreCursor}`);
    this.footerPinned = false;
  }

  private renderFooter(): void {
    if (!this.target.isTTY || !this.footer) return;
    const columns = this.target.columns || 120;
    const rows = this.target.rows || 24;
    const text = this.footer.length > columns
      ? `${this.footer.slice(0, Math.max(0, columns - 1))}…`
      : this.footer;
    this.target.write(
      `${ANSI.saveCursor}\u001b[${rows};1H${ANSI.clearLine}${ANSI.dim}${text}${ANSI.reset}${ANSI.restoreCursor}`,
    );
  }
}

const stickyOutput =
  process.stdout.isTTY ? new StickyFooterOutput(process.stdout) : null;
let footerPaused = false;

if (stickyOutput) {
  process.on("exit", () => stickyOutput.clearFooter());
}

export function pausePromptFooter(): void {
  footerPaused = true;
  stickyOutput?.clearFooter();
}

export function resumePromptFooter(): void {
  footerPaused = false;
}

export const PromptLegend = {
  default: "[esc] back | [enter] confirm | [ctrl+c] cancel",
  list: "[↑↓] move | [enter] confirm | [esc] back | [ctrl+c] cancel",
  multiselect:
    "[↑↓] move | [space] toggle | [enter] confirm | [esc] back | [ctrl+c] cancel",
  text: "[enter] send | [esc] back | [ctrl+c] cancel",
} as const;

type PromptLegendKey = keyof typeof PromptLegend;

const promptLegendState: Record<PromptLegendKey, string> = { ...PromptLegend };

export function setPromptFooter(text: string): void {
  if (footerPaused) return;
  stickyOutput?.setFooter(text);
}

export function setPromptLegend(key: PromptLegendKey, text: string): void {
  promptLegendState[key] = text;
}

export function usePromptLegend(key: PromptLegendKey): void {
  setPromptFooter(promptLegendState[key]);
}

export function getPromptOutput(): NodeJS.WriteStream | Writable {
  return stickyOutput ?? process.stdout;
}
