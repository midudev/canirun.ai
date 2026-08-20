import stringWidth from "fast-string-width";

export const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  gray: "\u001b[90m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  magenta: "\u001b[35m",
};

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

export function displayWidth(text: string): number {
  return stringWidth(stripAnsi(text));
}

export function wrapAnsi(text: string, width: number): string[] {
  const max = Math.max(1, Math.floor(width));
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  let i = 0;

  const flush = (): void => {
    lines.push(current);
    current = "";
    currentWidth = 0;
  };

  while (i < text.length) {
    if (text[i] === "\u001b") {
      const end = text.indexOf("m", i);
      if (end !== -1) {
        current += text.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "\n") {
      flush();
      i += 1;
      continue;
    }
    const char = text[i]!;
    const charWidth = stringWidth(char);
    if (currentWidth + charWidth > max && currentWidth > 0) flush();
    current += char;
    currentWidth += charWidth;
    i += 1;
  }
  if (current || lines.length === 0) flush();
  return lines;
}

export function padAnsi(text: string, width: number): string {
  const max = Math.max(0, Math.floor(width));
  const visible = displayWidth(text);
  if (visible >= max) return truncateAnsi(text, max);
  return `${text}${" ".repeat(max - visible)}`;
}

export function truncateAnsi(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (displayWidth(text) <= maxWidth) return text;

  let width = 0;
  let i = 0;
  const target = maxWidth - 1;
  while (i < text.length && width < target) {
    if (text[i] === "\u001b") {
      const end = text.indexOf("m", i);
      if (end !== -1) { i = end + 1; continue; }
    }
    const charWidth = stringWidth(text[i]!);
    if (width + charWidth > target) break;
    width += charWidth;
    i++;
  }
  return `${text.slice(0, i)}…${ANSI.reset}`;
}

export function paint(text: string, color: string, muted = false): string {
  if (!process.stdout.isTTY) return text;
  return `${muted ? ANSI.dim : ""}${color}${text}${ANSI.reset}`;
}

export function strong(text: string): string {
  if (!process.stdout.isTTY) return text;
  return `${ANSI.bold}${text}${ANSI.reset}`;
}

export function waveGradient(text: string, phase: number): string {
  if (!process.stdout.isTTY) return text;
  const chars = [...text];
  return chars.map((ch, index) => {
    const t = (index + phase) * 0.55;
    const mix = (Math.sin(t) + 1) / 2;
    const r = Math.round(245 + (255 - 245) * mix);
    const g = Math.round(165 + (235 - 165) * mix);
    const b = Math.round(40 + (120 - 40) * mix);
    return `\u001b[38;2;${r};${g};${b}m${ch}`;
  }).join("") + ANSI.reset;
}

export function gradientBrand(text: string): string {
  if (!process.stdout.isTTY) return text;
  const stops = [
    [236, 72, 153],
    [168, 85, 247],
    [59, 130, 246],
  ] as const;
  const chars = [...text];
  if (chars.length <= 1) return `\u001b[1m\u001b[38;2;236;72;153m${text}${ANSI.reset}`;
  return chars.map((ch, idx) => {
    const t = idx / (chars.length - 1);
    const seg = t < 0.5 ? 0 : 1;
    const localT = seg === 0 ? t * 2 : (t - 0.5) * 2;
    const [r1, g1, b1] = stops[seg]!;
    const [r2, g2, b2] = stops[seg + 1]!;
    const r = Math.round(r1 + (r2 - r1) * localT);
    const g = Math.round(g1 + (g2 - g1) * localT);
    const b = Math.round(b1 + (b2 - b1) * localT);
    return `\u001b[1m\u001b[38;2;${r};${g};${b}m${ch}${ANSI.reset}`;
  }).join("");
}

export function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

// ── Thinking block parser ──────────────────────────────────────

interface ThinkingDelimiters {
  open: RegExp;
  close: RegExp;
}

export interface ParsedThinkingBlock {
  hasThinking: boolean;
  thinkingText: string;
  answerText: string;
  isOpen: boolean;
}

const THINKING_DELIMITERS: ThinkingDelimiters[] = [
  { open: /<\s*think(?:ing)?\s*>/i, close: /<\s*\/\s*think(?:ing)?\s*>/i },
  { open: /<\|begin_of_thought\|>/i, close: /<\|end_of_thought\|>/i },
  { open: /<\|start_of_thought\|>/i, close: /<\|end_of_thought\|>/i },
];

export function parseThinkingBlock(text: string): ParsedThinkingBlock {
  let found: { start: number; end: number; delimiters: ThinkingDelimiters } | null = null;

  for (const delimiters of THINKING_DELIMITERS) {
    const startMatch = delimiters.open.exec(text);
    if (!startMatch || startMatch.index === undefined) continue;
    const start = startMatch.index;
    const end = start + startMatch[0].length;
    if (!found || start < found.start) {
      found = { start, end, delimiters };
    }
  }

  if (!found) {
    return { hasThinking: false, thinkingText: "", answerText: text, isOpen: false };
  }

  const afterOpen = text.slice(found.end);
  const closeMatch = found.delimiters.close.exec(afterOpen);
  if (!closeMatch || closeMatch.index === undefined) {
    return { hasThinking: true, thinkingText: afterOpen, answerText: "", isOpen: true };
  }

  const thinkingText = afterOpen.slice(0, closeMatch.index);
  const answerText = afterOpen.slice(closeMatch.index + closeMatch[0].length);
  return { hasThinking: true, thinkingText, answerText, isOpen: false };
}

// ── Markdown terminal renderer ─────────────────────────────────

export interface MarkdownRenderState {
  inCodeBlock: boolean;
  codeLang: string;
  lineBuffer: string;
}

const TS_JS_KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue",
  "default", "else", "export", "extends", "finally", "for", "from", "function",
  "if", "import", "interface", "let", "new", "return", "switch", "throw",
  "try", "type", "var", "while",
]);

const TS_JS_TYPES = new Set([
  "any", "boolean", "never", "null", "number", "object", "string",
  "undefined", "unknown", "void",
]);

const TS_JS_TOKEN_REGEX = /(\/\/.*$|\/\*.*?\*\/|`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:async|await|break|case|catch|class|const|continue|default|else|export|extends|finally|for|from|function|if|import|interface|let|new|return|switch|throw|try|type|var|while)\b|\b(?:any|boolean|never|null|number|object|string|undefined|unknown|void)\b|\b\d+(?:\.\d+)?\b)/g;

export function createMarkdownRenderState(): MarkdownRenderState {
  return { inCodeBlock: false, codeLang: "", lineBuffer: "" };
}

function isTsLike(lang: string): boolean {
  return ["js", "jsx", "javascript", "ts", "tsx", "typescript"].includes(lang);
}

function formatInlineMarkdown(text: string): string {
  if (!process.stdout.isTTY || !text) return text;

  const applyInline = (segment: string): string => {
    let out = segment;
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
      return `${paint(label, ANSI.cyan)} (${paint(url, ANSI.gray, true)})`;
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, (_m, value: string) => strong(value));
    out = out.replace(/\*([^*\n]+)\*/g, (_m, value: string) => paint(value, ANSI.magenta, true));
    out = out.replace(/_([^_\n]+)_/g, (_m, value: string) => paint(value, ANSI.magenta, true));
    return out;
  };

  let output = "";
  let cursor = 0;
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const index = match.index ?? 0;
    if (index > cursor) output += applyInline(text.slice(cursor, index));
    output += paint(match[0], ANSI.yellow);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) output += applyInline(text.slice(cursor));
  return output;
}

function highlightCodeLine(line: string, lang: string): string {
  if (!process.stdout.isTTY) return line;
  if (!isTsLike(lang)) return paint(line, ANSI.cyan, true);

  let out = "";
  let cursor = 0;
  for (const match of line.matchAll(TS_JS_TOKEN_REGEX)) {
    const index = match.index ?? 0;
    if (index > cursor) out += line.slice(cursor, index);
    const token = match[0];

    if (token.startsWith("//") || token.startsWith("/*")) {
      out += paint(token, ANSI.gray, true);
    } else if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")) {
      out += paint(token, ANSI.green);
    } else if (TS_JS_KEYWORDS.has(token)) {
      out += paint(token, ANSI.blue);
    } else if (TS_JS_TYPES.has(token)) {
      out += paint(token, ANSI.yellow);
    } else {
      out += paint(token, ANSI.magenta);
    }
    cursor = index + token.length;
  }

  if (cursor < line.length) out += line.slice(cursor);
  return out;
}

export function renderMarkdownLine(line: string, state: MarkdownRenderState): string {
  const fence = line.match(/^\s*```([\w-]+)?\s*$/);
  if (fence) {
    if (!state.inCodeBlock) {
      state.inCodeBlock = true;
      state.codeLang = (fence[1] || "").toLowerCase();
    } else {
      state.inCodeBlock = false;
      state.codeLang = "";
    }
    return paint(line, ANSI.gray, true);
  }

  if (state.inCodeBlock) return highlightCodeLine(line, state.codeLang);
  if (!process.stdout.isTTY) return line;

  const heading = line.match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    const level = heading[1]!.length;
    const content = formatInlineMarkdown(heading[2]!);
    if (level <= 2) return `${strong(content)}`;
    return `${paint("#".repeat(level), ANSI.gray, true)} ${strong(content)}`;
  }

  const quote = line.match(/^\s*>\s?(.*)$/);
  if (quote) {
    return `${paint("│", ANSI.gray, true)} ${paint(formatInlineMarkdown(quote[1]!), ANSI.gray, true)}`;
  }

  const bullet = line.match(/^(\s*)([-*+])\s+(.*)$/);
  if (bullet) {
    return `${bullet[1]}${paint("•", ANSI.cyan)} ${formatInlineMarkdown(bullet[3]!)}`;
  }

  const ordered = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (ordered) {
    return `${ordered[1]}${paint(`${ordered[2]}.`, ANSI.cyan)} ${formatInlineMarkdown(ordered[3]!)}`;
  }

  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
    return paint("────────────────────────", ANSI.gray, true);
  }

  return formatInlineMarkdown(line);
}

export function renderMarkdownDelta(delta: string, state: MarkdownRenderState): string {
  state.lineBuffer += delta;
  let out = "";
  while (true) {
    const newlineIndex = state.lineBuffer.indexOf("\n");
    if (newlineIndex === -1) break;
    const line = state.lineBuffer.slice(0, newlineIndex);
    state.lineBuffer = state.lineBuffer.slice(newlineIndex + 1);
    out += `${renderMarkdownLine(line, state)}\n`;
  }
  return out;
}

export function flushMarkdownDelta(state: MarkdownRenderState): string {
  if (!state.lineBuffer) return "";
  const remainder = renderMarkdownLine(state.lineBuffer, state);
  state.lineBuffer = "";
  return remainder;
}
