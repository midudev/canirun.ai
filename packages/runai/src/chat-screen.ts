import { stdin as input, stdout as output } from "node:process";
import {
  ANSI,
  createMarkdownRenderState,
  displayWidth,
  gradientBrand,
  padAnsi,
  paint,
  renderMarkdownLine,
  wrapAnsi,
} from "./terminal";

const ENTER_ALT = "\u001b[?1049h";
const EXIT_ALT = "\u001b[?1049l";
const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";
const STEADY_BAR = "\u001b[6 q";
const RESET_CURSOR = "\u001b[0 q";
const HOME = "\u001b[H";
const CLEAR = "\u001b[2J";
const SPINNER = ["◐", "◓", "◑", "◒"] as const;
const MIN_RENDER_MS = 50;
export const INPUT_PREFIX = "› ";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  metrics?: string;
}

export interface ChatLiveState {
  status: "thinking" | "replying";
  thinking: string;
  answer: string;
}

export interface ChatScreenModel {
  modelName: string;
  showThinking: boolean;
  turns: ChatTurn[];
  live: ChatLiveState | null;
  input: string;
}

export function lastLines(lines: string[], height: number): string[] {
  if (height <= 0) return [];
  if (lines.length >= height) return lines.slice(-height);
  return [...lines, ...Array.from({ length: height - lines.length }, () => "")];
}

function wrapPlain(text: string, width: number, color?: string, muted = false): string[] {
  const painted = color ? paint(text, color, muted) : text;
  return wrapAnsi(painted, width);
}

function renderMarkdownBlock(text: string, width: number): string[] {
  const state = createMarkdownRenderState();
  const out: string[] = [];
  const source = text.length > 0 ? text.split("\n") : [""];
  for (const line of source) {
    out.push(...wrapAnsi(renderMarkdownLine(line, state), width));
  }
  return out;
}

export function buildTranscriptLines(
  model: ChatScreenModel,
  width: number,
  spinnerIndex = 0,
): string[] {
  const inner = Math.max(16, width - 2);
  const lines: string[] = [];
  const pushBlank = (): void => {
    if (lines.at(-1) !== "") lines.push("");
  };

  for (const turn of model.turns) {
    if (turn.role === "user") {
      lines.push(paint("You", ANSI.green, true));
      lines.push(...wrapPlain(turn.text, inner, ANSI.gray, true));
      pushBlank();
      continue;
    }
    lines.push(paint("Assistant", ANSI.cyan, true));
    lines.push(...renderMarkdownBlock(turn.text, inner));
    if (turn.metrics) {
      lines.push(paint(turn.metrics, ANSI.gray, true));
    }
    pushBlank();
  }

  if (model.live) {
    if (model.live.status === "thinking" || (model.showThinking && model.live.thinking.trim())) {
      const frame = SPINNER[spinnerIndex % SPINNER.length];
      const title = model.live.status === "thinking"
        ? `${paint(frame, ANSI.yellow)} ${paint("Thinking", ANSI.yellow)}`
        : paint("Thought", ANSI.yellow, true);
      lines.push(title);
      if (model.showThinking && model.live.thinking.trim()) {
        lines.push(...wrapPlain(model.live.thinking.trim(), inner, ANSI.gray, true));
      }
      pushBlank();
    }
    if (model.live.answer) {
      lines.push(paint("Assistant", ANSI.cyan, true));
      lines.push(...renderMarkdownBlock(model.live.answer, inner));
      pushBlank();
    }
  }

  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function visibleInputValue(input: string, width: number): { text: string; cursorCol: number } {
  const prefixWidth = displayWidth(INPUT_PREFIX);
  const available = Math.max(1, width - prefixWidth);
  const chars = [...input];
  let text = input;
  while (displayWidth(text) > available && chars.length > 0) {
    chars.shift();
    text = chars.join("");
  }
  return {
    text,
    cursorCol: Math.max(1, Math.min(width, prefixWidth + displayWidth(text) + 1)),
  };
}

export function getInputCursor(
  model: ChatScreenModel,
  cols: number,
  rows: number,
): { row: number; col: number } | null {
  if (model.live) return null;
  const width = Math.max(40, cols);
  const height = Math.max(8, rows);
  return {
    row: height - 1,
    col: visibleInputValue(model.input, width).cursorCol,
  };
}

export function renderChatFrame(
  model: ChatScreenModel,
  cols: number,
  rows: number,
  spinnerIndex = 0,
): string {
  const width = Math.max(40, cols);
  const height = Math.max(8, rows);
  const header = [
    gradientBrand("runai"),
    paint(model.modelName, ANSI.cyan),
    paint(model.showThinking ? "thinking ON" : "thinking OFF", model.showThinking ? ANSI.yellow : ANSI.gray, true),
  ].join(paint("  ·  ", ANSI.gray, true));
  const hints = paint("enter send · esc back · ctrl+t thinking · /exit quit", ANSI.gray, true);
  const inputPrefix = paint(INPUT_PREFIX, ANSI.cyan);
  const inputValue = model.live
    ? paint("generating…", ANSI.gray, true)
    : visibleInputValue(model.input, width).text;
  const inputLine = `${inputPrefix}${inputValue}`;

  const bodyHeight = Math.max(1, height - 5);
  const body = lastLines(buildTranscriptLines(model, width, spinnerIndex), bodyHeight);
  const rule = paint("─".repeat(width), ANSI.gray, true);

  const rowsOut = [
    padAnsi(header, width),
    padAnsi(rule, width),
    ...body.map((line) => padAnsi(line, width)),
    padAnsi(rule, width),
    padAnsi(inputLine, width),
    padAnsi(hints, width),
  ];

  while (rowsOut.length < height) rowsOut.push(padAnsi("", width));
  return `${HOME}${rowsOut.slice(0, height).join("\n")}`;
}

export class ChatScreen {
  private model: ChatScreenModel;
  private active = false;
  private spinnerIndex = 0;
  private lastRenderAt = 0;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onResize = (): void => {
    this.render(true);
  };

  constructor(modelName: string) {
    this.model = {
      modelName,
      showThinking: true,
      turns: [],
      live: null,
      input: "",
    };
  }

  get state(): ChatScreenModel {
    return this.model;
  }

  enter(): void {
    if (!output.isTTY || this.active) return;
    output.write(`${ENTER_ALT}${HIDE_CURSOR}${CLEAR}${HOME}`);
    output.on("resize", this.onResize);
    this.active = true;
    this.render(true);
  }

  exit(): void {
    if (!this.active) return;
    this.clearTimers();
    output.off("resize", this.onResize);
    output.write(`${RESET_CURSOR}${SHOW_CURSOR}${EXIT_ALT}`);
    this.active = false;
  }

  set(patch: Partial<ChatScreenModel>, immediate = false): void {
    this.model = { ...this.model, ...patch };
    this.render(immediate);
  }

  toggleThinking(): boolean {
    this.model = { ...this.model, showThinking: !this.model.showThinking };
    this.render(true);
    return this.model.showThinking;
  }

  startLive(): void {
    this.model = {
      ...this.model,
      live: { status: "thinking", thinking: "", answer: "" },
    };
    this.startSpinner();
    this.render(true);
  }

  updateLive(patch: Partial<ChatLiveState>, immediate = false): void {
    if (!this.model.live) return;
    this.model = { ...this.model, live: { ...this.model.live, ...patch } };
    this.render(immediate);
  }

  finishTurn(turn: ChatTurn): void {
    this.stopSpinner();
    this.model = {
      ...this.model,
      turns: [...this.model.turns, turn],
      live: null,
    };
    this.render(true);
  }

  watchHotkeys(): () => void {
    if (!input.isTTY) return () => {};
    const onData = (chunk: string | Buffer): void => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      if (bytes.length === 1 && bytes[0] === 0x14) this.toggleThinking();
    };
    input.on("data", onData);
    return () => {
      input.off("data", onData);
    };
  }

  async readLine(): Promise<string | null> {
    this.model = { ...this.model, input: "" };
    this.render(true);
    return readTerminalLine({
      getValue: () => this.model.input,
      setValue: (value) => this.set({ input: value }, true),
      onToggleThinking: () => this.toggleThinking(),
      showCursor: () => {
        if (this.active) output.write(SHOW_CURSOR);
      },
      hideCursor: () => {
        if (this.active) output.write(HIDE_CURSOR);
      },
    });
  }

  render(immediate = false): void {
    if (!this.active || !output.isTTY) return;
    const now = Date.now();
    if (!immediate && now - this.lastRenderAt < MIN_RENDER_MS) {
      if (!this.pending) {
        this.pending = setTimeout(() => {
          this.pending = null;
          this.render(true);
        }, MIN_RENDER_MS);
      }
      return;
    }
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = null;
    }
    this.lastRenderAt = now;
    const cols = output.columns || 80;
    const rows = output.rows || 24;
    const frame = renderChatFrame(this.model, cols, rows, this.spinnerIndex);
    const cursor = getInputCursor(this.model, cols, rows);
    if (cursor) {
      output.write(`${frame}\u001b[${cursor.row};${cursor.col}H${STEADY_BAR}${SHOW_CURSOR}`);
    } else {
      output.write(`${frame}${HIDE_CURSOR}`);
    }
  }

  private startSpinner(): void {
    this.stopSpinner();
    this.spinnerTimer = setInterval(() => {
      if (this.model.live?.status !== "thinking") return;
      this.spinnerIndex += 1;
      this.render(true);
    }, 160);
  }

  private stopSpinner(): void {
    if (!this.spinnerTimer) return;
    clearInterval(this.spinnerTimer);
    this.spinnerTimer = null;
  }

  private clearTimers(): void {
    this.stopSpinner();
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = null;
    }
  }
}

interface ReadLineHooks {
  getValue: () => string;
  setValue: (value: string) => void;
  onToggleThinking: () => void;
  showCursor: () => void;
  hideCursor: () => void;
}

async function readTerminalLine(hooks: ReadLineHooks): Promise<string | null> {
  if (!input.isTTY) return null;
  const stream = input as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };
  const wasRaw = Boolean(stream.isRaw);
  stream.setRawMode?.(true);
  stream.resume();
  stream.ref();
  hooks.showCursor();
  const decoder = new TextDecoder();

  try {
    return await new Promise<string | null>((resolve) => {
      const finish = (value: string | null): void => {
        stream.off("data", onData);
        resolve(value);
      };
      const onData = (chunk: string | Buffer): void => {
        const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
        let i = 0;
        while (i < text.length) {
          const char = text[i]!;
          const code = char.charCodeAt(0);
          if (char === "\x03") {
            finish(null);
            return;
          }
          if (char === "\x14") {
            hooks.onToggleThinking();
            i += 1;
            continue;
          }
          if (char === "\r" || char === "\n") {
            finish(hooks.getValue());
            return;
          }
          if (char === "\x7f" || char === "\b") {
            hooks.setValue([...hooks.getValue()].slice(0, -1).join(""));
            i += 1;
            continue;
          }
          if (char === "\x1b") {
            const next = text[i + 1];
            if (next === "[" || next === "O") {
              i += next === "[" && text[i + 2] ? 3 : 2;
              continue;
            }
            finish(null);
            return;
          }
          if (code < 32) {
            i += 1;
            continue;
          }
          hooks.setValue(`${hooks.getValue()}${char}`);
          i += 1;
        }
      };
      stream.on("data", onData);
    });
  } finally {
    hooks.hideCursor();
    stream.setRawMode?.(wasRaw);
    stream.unref();
  }
}

export function formatChatMetrics(options: {
  tokensPerSec: number;
  elapsedMs: number;
  thinkingMs?: number;
}): string {
  const parts = [
    `⚡ ${options.tokensPerSec.toFixed(1)} tok/s`,
    `⏱ ${(options.elapsedMs / 1000).toFixed(2)}s`,
  ];
  if (options.thinkingMs && options.thinkingMs > 0) {
    parts.push(`🧠 ${(options.thinkingMs / 1000).toFixed(2)}s thinking`);
  }
  return parts.join("  ·  ");
}
