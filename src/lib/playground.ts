import * as Comlink from "comlink";
import type {
  GenerationResult,
  LoadProgress,
  PlaygroundDevice,
  TokenEvent,
  WorkerAPI,
  WorkerMessage,
} from "./playground-worker-types";

// ── Types ──────────────────────────────────────────────────

interface ModelCapabilities {
  vision: boolean;
  audio: boolean;
  thinking: boolean;
  thinkingFormat?: "qwen" | "gpt-oss";
}

interface PlaygroundModel {
  id: string;
  name: string;
  params: string;
  sizeHint: string;
  description: string;
  provider: string;
  capabilities: ModelCapabilities;
  maxNewTokens: number;
  contextWindow: number;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
  audioUrl?: string;
  stats?: { tps: number; numTokens: number; elapsedMs: number; thinkingSecs?: number };
  modelId?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  modelId: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
  folderId?: string | null;
}

interface Folder {
  id: string;
  name: string;
  collapsed?: boolean;
}

interface Settings {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  lastModelId: string;
}

interface FileProgress {
  file: string;
  loaded: number;
  total: number;
  done: boolean;
}

interface Attachment {
  id: string;
  type: "image" | "document";
  name: string;
  dataUrl: string;
  textContent: string;
}

interface QueuedMessage {
  id: string;
  text: string;
  attachments: Attachment[];
  audioUrl: string | null;
  audioBlob: Blob | null;
}

// ── Constants ──────────────────────────────────────────────

const MODELS: PlaygroundModel[] = [
  {
    id: "onnx-community/gemma-4-E4B-it-ONNX",
    name: "Gemma 4 E4B IT",
    params: "8B",
    sizeHint: "~4.5 GB",
    description: "Google's multimodal Gemma 4 — vision + text, 128K context",
    provider: "Google",
    capabilities: { vision: true, audio: true, thinking: false },
    maxNewTokens: 4096,
    contextWindow: 128_000,
  },
];

const STORAGE_CONVERSATIONS = "pg_conversations";
const STORAGE_SETTINGS = "pg_settings";
const STORAGE_ACTIVE = "pg_active_conversation";
const STORAGE_FOLDERS = "pg_folders";
const STORAGE_SIDEBAR_COLLAPSED = "pg_sidebar_collapsed";

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_CONTEXT_WINDOW = 32_768;
const APPROX_CHARS_PER_TOKEN = 4;
const IMAGE_CONTEXT_TOKENS = 768;
const AUDIO_CONTEXT_TOKENS = 512;
const CONTEXT_WARN_RATIO = 0.65;
const CONTEXT_DANGER_RATIO = 0.85;
const CONTEXT_KEEP_RECENT_MESSAGES = 6;
const CONTEXT_SUMMARY_PREFIX = "Conversation summary so far:";
const CONTEXT_SUMMARY_MAX_CHARS = 6000;
const CONTEXT_MESSAGE_SUMMARY_MAX_CHARS = 700;

const LOADING_TIPS: readonly string[] = [
  "Models are cached locally — next time loads instantly.",
  "Your conversations never leave your device.",
  "Press Shift + Enter to add a new line in your message.",
  "WebGPU runs inference much faster than CPU-only.",
  "Switch models any time without losing your chat history.",
  "Drop images into the input to use vision-capable models.",
  "Smaller models load faster; larger ones often answer better.",
  "Open Settings to tune temperature, top-p and max tokens.",
  "Once cached, models work fully offline — try airplane mode.",
  "Click the model selector to browse browser-friendly models.",
  "First load downloads the model; subsequent loads are instant.",
  "Everything runs on your hardware. No API keys. No tracking.",
];
const LOADING_TIP_INTERVAL_MS = 5500;

const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "You are a helpful, concise assistant.",
  temperature: 0.7,
  maxTokens: DEFAULT_MAX_TOKENS,
  topP: 0.9,
  lastModelId: "",
};

// ── State ──────────────────────────────────────────────────

let conversations: Conversation[] = [];
let activeConversationId: string | null = null;
let settings: Settings = { ...DEFAULT_SETTINGS };
let isGenerating = false;
let hasWebGPU = false;
let folders: Folder[] = [];
let sidebarCollapsed = false;
let showArchived = false;
let searchQuery = "";

let currentModelId = "";
let modelReady = false;
let modelHasProcessor = false;
let isModelLoading = false;
let streamingFullText = "";
let pendingAttachments: Attachment[] = [];
let isRecording = false;
let speechRecognition: any = null;
let preRecordingText = "";
let cachedModelIds: Set<string> = new Set();
let thinkingStartTime: number | null = null;
let thinkingDurationSecs = 0;
let pendingStreamingFrame = false;
let pendingStreamingArgs: { text: string; tps: number; numTokens: number } | null = null;
let playgroundWorker: Worker | null = null;
let playgroundApi: Comlink.Remote<WorkerAPI> | null = null;
let activeSendPromise: Promise<void> | null = null;
let loadingTipTimer: number | null = null;
let messageQueue: QueuedMessage[] = [];
let editingQueueId: string | null = null;
let editingDraft = "";
let editingSelection: { start: number; end: number } | null = null;
let pendingDrain = false;
const regeneratingTitles = new Set<string>();

// ── DOM refs ───────────────────────────────────────────────

let $: Record<string, HTMLElement> = {};

function initDom() {
  const ids = [
    "pg-sidebar", "pg-sidebar-backdrop", "pg-sidebar-toggle", "pg-sidebar-close",
    "pg-sidebar-collapse",
    "pg-new-chat", "pg-conversation-list", "pg-clear-all", "pg-sidebar-footer",
    "pg-search-trigger", "pg-search-bar", "pg-search-input", "pg-search-close",
    "pg-archived-toggle", "pg-context-menu",
    "pg-model-picker", "pg-model-trigger", "pg-model-trigger-label",
    "pg-model-trigger-status", "pg-model-dropdown",
    "pg-model-status", "pg-settings-btn",
    "pg-messages", "pg-welcome",
    "pg-input-area", "pg-input-wrapper", "pg-input", "pg-context-compact", "pg-send", "pg-stop",
    "pg-attach-btn", "pg-mic-btn", "pg-attachments", "pg-queue", "pg-file-input",
    "pg-settings", "pg-settings-backdrop", "pg-settings-close",
    "pg-system-prompt", "pg-temperature", "pg-temperature-val",
    "pg-max-tokens", "pg-max-tokens-val", "pg-top-p", "pg-top-p-val",
    "pg-model-info", "pg-cached-list", "pg-cached-total", "pg-delete-all-cache",
    "pg-webgpu-status",
    "pg-drop-overlay",
  ];
  $ = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) $[id] = el;
  }
}

// ── Storage ────────────────────────────────────────────────

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_CONVERSATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations() {
  const stripped = conversations.map((c) => ({
    ...c,
    messages: c.messages.map((m) => {
      if (!m.images?.length && !m.audioUrl) return m;
      const clean: Message = { ...m };
      if (clean.images?.length) clean.images = clean.images.map(() => "");
      if (clean.audioUrl) clean.audioUrl = "";
      return clean;
    }),
  }));
  try {
    localStorage.setItem(STORAGE_CONVERSATIONS, JSON.stringify(stripped));
  } catch {
    // quota still exceeded – drop oldest non-pinned conversations until it fits
    const sacrificial = stripped
      .filter((c) => !c.pinned)
      .sort((a, b) => a.updatedAt - b.updatedAt);
    while (sacrificial.length) {
      const victim = sacrificial.shift()!;
      const idx = stripped.findIndex((c) => c.id === victim.id);
      if (idx !== -1) stripped.splice(idx, 1);
      try {
        localStorage.setItem(STORAGE_CONVERSATIONS, JSON.stringify(stripped));
        return;
      } catch { /* keep trimming */ }
    }
  }
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
}

function loadActiveId(): string | null {
  return localStorage.getItem(STORAGE_ACTIVE);
}

function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(STORAGE_ACTIVE, id);
  else localStorage.removeItem(STORAGE_ACTIVE);
}

function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(STORAGE_FOLDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFolders() {
  localStorage.setItem(STORAGE_FOLDERS, JSON.stringify(folders));
}

function loadSidebarCollapsed(): boolean {
  return localStorage.getItem(STORAGE_SIDEBAR_COLLAPSED) === "true";
}

function saveSidebarCollapsed() {
  localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, String(sidebarCollapsed));
}

// ── Markdown renderer ──────────────────────────────────────

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Code blocks: ```lang\ncode\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const cls = lang ? ` class="language-${lang}"` : "";
    return `<pre class="pg-code-block"><code${cls}>${code.trimEnd()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="pg-inline-code">$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic (single *)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="text-accent hover:underline">$1</a>',
  );

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h4 class="text-xs font-semibold text-primary mt-3 mb-1">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="text-sm font-semibold text-primary mt-3 mb-1">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="text-base font-semibold text-primary mt-3 mb-1">$1</h2>');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="pg-list-item">$1</li>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="pg-list-item pg-list-ordered">$1</li>');

  // Paragraphs: double newlines
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("<h") || trimmed.startsWith("<pre") || trimmed.startsWith("<li")) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join("\n");

  // Single newlines within paragraphs
  html = html.replace(/(?<!>)\n(?!<)/g, "<br>");

  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Thinking / CoT separation ───────────────────────────────

interface ThinkingResult {
  thinking: string;
  response: string;
  isThinking: boolean;
}

function getActiveThinkingFormat(): "qwen" | "gpt-oss" | undefined {
  return getActiveModelDef()?.capabilities.thinkingFormat;
}

function tryParseQwenThinking(text: string): ThinkingResult | null {
  const closed = text.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
  if (closed) {
    return { thinking: closed[1].trim(), response: closed[2].trim(), isThinking: false };
  }
  if (text.startsWith("<think>") && !text.includes("</think>")) {
    return { thinking: text.slice(7).trim(), response: "", isThinking: true };
  }
  return null;
}

function tryParseGptOssThinking(text: string): ThinkingResult | null {
  // Special tokens are stripped by the streamer, leaving role names
  // concatenated with content: "analysis<thinking>assistant[final]<response>"
  if (!text.startsWith("analysis")) return null;
  const assistantIdx = text.indexOf("assistant", "analysis".length);
  if (assistantIdx > 0) {
    const thinking = text.slice("analysis".length, assistantIdx).trim();
    let response = text.slice(assistantIdx + "assistant".length);
    response = response.replace(/^final\s*/, "").trim();
    return { thinking, response, isThinking: false };
  }
  return { thinking: text.slice("analysis".length).trim(), response: "", isThinking: true };
}

/**
 * Streaming-aware: only parses the format matching the active model,
 * avoiding false positives (e.g. GPT-OSS "analysis" prefix on Qwen text).
 */
function separateThinking(text: string): ThinkingResult {
  const format = getActiveThinkingFormat();

  if (format === "qwen") {
    return tryParseQwenThinking(text) ?? { thinking: "", response: text, isThinking: false };
  }
  if (format === "gpt-oss") {
    return tryParseGptOssThinking(text) ?? { thinking: "", response: text, isThinking: false };
  }

  return { thinking: "", response: text, isThinking: false };
}

/**
 * For saved messages: tries all known formats since the message may have
 * been generated by a model that is no longer active.
 */
function separateThinkingSaved(text: string): ThinkingResult {
  return tryParseQwenThinking(text)
    ?? tryParseGptOssThinking(text)
    ?? { thinking: "", response: text, isThinking: false };
}

function renderThinkingLive(thinking: string, elapsedSecs: number): string {
  if (!thinking) {
    return `<div class="pg-thinking-live mb-2">
      <div class="pg-thinking-live-header"><span class="pg-thinking-live-spinner"></span>Thinking\u2026</div>
    </div>`;
  }
  const timeLabel = elapsedSecs > 0 ? ` (${Math.round(elapsedSecs)}s)` : "";
  return `<div class="pg-thinking-live mb-2">
    <div class="pg-thinking-live-header"><span class="pg-thinking-live-spinner"></span>Thinking${timeLabel}\u2026</div>
    <div class="pg-thinking-live-text">${escapeHtml(thinking)}</div>
  </div>`;
}

function renderThinkingCollapsed(thinking: string, durationSecs?: number): string {
  if (!thinking) return "";
  let label: string;
  if (durationSecs != null && durationSecs > 0) {
    const secs = Math.round(durationSecs);
    label = secs === 1 ? "Thought for 1 second" : `Thought for ${secs} seconds`;
  } else {
    label = "Thought process";
  }
  return `<details class="pg-thinking-block mb-2">
    <summary class="pg-thinking-summary">${label}</summary>
    <div class="mt-1.5 text-xs text-muted/50 leading-relaxed border-l-2 border-edge/30 pl-3">${escapeHtml(thinking)}</div>
  </details>`;
}

// ── WebGPU detection ───────────────────────────────────────

async function detectWebGPU(): Promise<boolean> {
  try {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

// ── Model engine ───────────────────────────────────────────

function getPlaygroundApi(): Comlink.Remote<WorkerAPI> {
  if (!playgroundApi) {
    playgroundWorker = new Worker(new URL("./playground-worker.ts", import.meta.url), { type: "module" });
    playgroundApi = Comlink.wrap<WorkerAPI>(playgroundWorker);
  }
  return playgroundApi;
}

function abortWorkerWork() {
  if (playgroundApi) {
    void playgroundApi.abort();
  }
}

/**
 * Cancels the in-flight generation (if any) and immediately restores
 * the input UI so the user can type a new message in another conversation.
 * The in-flight `handleSend` will still resolve naturally and append the
 * partial assistant response to the conversation it was originally bound to.
 */
function abortActiveGeneration(): void {
  if (!isGenerating) return;
  abortWorkerWork();
  hideStopButton();
}

async function loadModel(modelId: string): Promise<boolean> {
  if (isModelLoading) return false;
  if (currentModelId === modelId && modelReady) return true;

  isModelLoading = true;
  modelReady = false;
  modelHasProcessor = false;
  currentModelId = "";
  showLoading(modelId);
  updateModelStatus("loading", "Loading...");

  try {
    const fileProgress = new Map<string, FileProgress>();
    let totalBytes = 0;
    let loadedBytes = 0;

    const progressCallback = (progress: LoadProgress) => {
      if (progress.status === "message" && progress.message) {
        updateLoadingSubtitle(progress.message);
        return;
      }

      if (progress.status === "progress_total" && progress.total) {
        totalBytes = progress.total;
      }

      if (progress.status === "initiate" && progress.file) {
        fileProgress.set(progress.file, { file: progress.file, loaded: 0, total: 0, done: false });
        renderLoadingFiles(fileProgress);
      }

      if (progress.status === "progress" && progress.file) {
        const fp = fileProgress.get(progress.file);
        if (fp) {
          fp.loaded = progress.loaded || 0;
          fp.total = progress.total || 0;
        }
        loadedBytes = [...fileProgress.values()].reduce((sum, f) => sum + f.loaded, 0);
        const pct = totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : (progress.progress || 0);
        updateLoadingProgress(pct, loadedBytes, totalBytes);
        renderLoadingFiles(fileProgress);
      }

      if (progress.status === "done" && progress.file) {
        const fp = fileProgress.get(progress.file);
        if (fp) {
          fp.done = true;
          fp.loaded = fp.total;
        }
        renderLoadingFiles(fileProgress);
      }
    };

    const device: PlaygroundDevice = hasWebGPU ? "webgpu" : "wasm";
    const result = await getPlaygroundApi().load(modelId, device, Comlink.proxy(progressCallback));
    if (!result.ok) throw new Error(result.cancelled ? "Cancelled" : result.error || "Unknown error");

    currentModelId = modelId;
    modelReady = true;
    modelHasProcessor = !!result.hasProcessor;
    settings.lastModelId = modelId;
    applyModelMaxTokens(modelId);
    saveSettings();

    hideLoading();
    updateModelStatus("ready", `Ready (${device.toUpperCase()})`);
    enableInput();
    return true;
  } catch (err: any) {
    hideLoading();
    if (err?.message === "Cancelled") {
      updateModelStatus("idle", "Not loaded");
    } else {
      console.error("Model load error:", err);
      updateModelStatus("error", "Load failed");
      showError(`Failed to load model: ${err?.message || "Unknown error"}`);
    }
    return false;
  } finally {
    isModelLoading = false;
  }
}

function toWorkerMessages(messages: Message[]): WorkerMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    images: message.images,
    audioUrl: message.audioUrl,
  }));
}

async function generateResponse(msgs: Message[], audioBlob?: Blob | null): Promise<GenerationResult> {
  if (!modelReady) return { text: "", numTokens: 0, tps: 0, elapsedMs: 0 };

  isGenerating = true;
  showStopButton();
  thinkingStartTime = null;
  thinkingDurationSecs = 0;

  try {
    streamingFullText = "";
    const caps = getActiveCapabilities();

    const onToken = (event: TokenEvent) => {
      streamingFullText = event.text;
      scheduleStreamingUpdate(event.text, event.tps, event.numTokens);
    };

    let audio: { data: Float32Array; sampleRate: number } | null = null;
    if (audioBlob && caps.audio && modelHasProcessor) {
      try {
        const targetSampleRate = (await getPlaygroundApi().getAudioSampleRate()) ?? 16000;
        const data = await decodeAudioBlob(audioBlob, targetSampleRate);
        audio = { data, sampleRate: targetSampleRate };
      } catch (err) {
        console.error("Failed to decode audio:", err);
        showError("Could not decode the recorded audio. Try recording again.");
      }
    }

    const result = await getPlaygroundApi().generate({
      messages: toWorkerMessages(msgs),
      settings: {
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        topP: settings.topP,
      },
      thinkingFormat: getActiveThinkingFormat(),
      capabilities: {
        vision: caps.vision,
        audio: caps.audio,
      },
      audio,
    }, Comlink.proxy(onToken));

    flushStreamingUpdate();

    if (result.error) {
      showError(`Generation failed: ${result.error}`);
    }

    return result;
  } catch (err: any) {
    console.error("Generation error:", err);
    showError(`Generation failed: ${err?.message || "Unknown error"}`);
    return { text: "", numTokens: 0, tps: 0, elapsedMs: 0 };
  } finally {
    isGenerating = false;
    hideStopButton();
  }
}

// ── Conversation management ────────────────────────────────

function createConversation(modelId: string): Conversation {
  const conv: Conversation = {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    modelId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  conversations.unshift(conv);
  saveConversations();
  return conv;
}

function getActiveConversation(): Conversation | undefined {
  return conversations.find((c) => c.id === activeConversationId);
}

function switchConversation(id: string) {
  if (id === activeConversationId) return;
  abortActiveGeneration();
  clearQueue();
  activeConversationId = id;
  saveActiveId(id);
  renderMessages();
  renderConversationList();
  updateInputState();
}

function deleteConversation(id: string) {
  if (activeConversationId === id) {
    abortActiveGeneration();
    clearQueue();
  }
  conversations = conversations.filter((c) => c.id !== id);
  saveConversations();
  if (activeConversationId === id) {
    const visible = conversations.filter((c) => !c.archived);
    activeConversationId = visible[0]?.id || null;
    saveActiveId(activeConversationId);
    updateInputState();
  }
  renderMessages();
  renderConversationList();
}

function togglePin(id: string) {
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;
  conv.pinned = !conv.pinned;
  saveConversations();
  renderConversationList();
}

function archiveConversation(id: string) {
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;
  conv.archived = !conv.archived;
  if (conv.archived) conv.pinned = false;
  saveConversations();
  if (activeConversationId === id && conv.archived) {
    abortActiveGeneration();
    clearQueue();
    const visible = conversations.filter((c) => !c.archived);
    activeConversationId = visible[0]?.id || null;
    saveActiveId(activeConversationId);
    renderMessages();
    updateInputState();
  }
  renderConversationList();
}

function moveToFolder(convId: string, folderId: string | null) {
  const conv = conversations.find((c) => c.id === convId);
  if (!conv) return;
  conv.folderId = folderId;
  saveConversations();
  renderConversationList();
}

function renameConversation(id: string) {
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;
  const newTitle = prompt("Rename conversation:", conv.title);
  if (newTitle !== null && newTitle.trim()) {
    conv.title = newTitle.trim();
    saveConversations();
    renderConversationList();
  }
}

function buildTitlePromptMessages(conv: Conversation): WorkerMessage[] {
  const transcript = conv.messages
    .filter((m) => m.role !== "system")
    .slice(0, 6)
    .map((m) => {
      const speaker = m.role === "user" ? "User" : "Assistant";
      const text = m.content.replace(/\s+/g, " ").trim().slice(0, 600);
      return `${speaker}: ${text || "(empty)"}`;
    })
    .join("\n\n");

  const system = "You generate short, descriptive titles for chat conversations. Reply with ONLY the title — no quotes, no prefix, no trailing punctuation. Use the same language as the conversation. Max 5 words.";
  const user = `Conversation:\n\n${transcript}\n\nTitle:`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function cleanGeneratedTitle(raw: string): string {
  const { response } = separateThinkingSaved(raw);
  let cleaned = (response || raw).trim();

  const newlineIdx = cleaned.indexOf("\n");
  if (newlineIdx >= 0) cleaned = cleaned.slice(0, newlineIdx).trim();

  cleaned = cleaned.replace(/^title\s*[:\-\u2014\u2013]\s*/i, "");
  cleaned = cleaned.replace(/^["'`\u00ab\u00bb\u201c\u201d\u2018\u2019]+/, "");
  cleaned = cleaned.replace(/["'`\u00ab\u00bb\u201c\u201d\u2018\u2019]+$/, "");
  cleaned = cleaned.replace(/[.;:!?\-\u2014\u2013\s]+$/g, "");
  cleaned = cleaned.trim();

  if (cleaned.length > 60) {
    cleaned = `${cleaned.slice(0, 60).trim()}\u2026`;
  }
  return cleaned;
}

async function regenerateConversationTitle(id: string) {
  if (regeneratingTitles.has(id)) return;

  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;

  if (isGenerating || isModelLoading) {
    showWarning("Wait for the current generation to finish before regenerating a title.");
    return;
  }

  if (!modelReady) {
    showWarning("Load a model first to regenerate titles with AI.");
    return;
  }

  if (!conv.messages.some((m) => m.role !== "system" && m.content.trim().length > 0)) {
    showWarning("Send a message first before regenerating the title.");
    return;
  }

  regeneratingTitles.add(id);
  isGenerating = true;
  renderConversationList();

  try {
    const messages = buildTitlePromptMessages(conv);
    const caps = getActiveCapabilities();
    const noop = () => {};

    const result = await getPlaygroundApi().generate(
      {
        messages,
        settings: {
          temperature: 0.4,
          maxTokens: 48,
          topP: 0.9,
        },
        thinkingFormat: getActiveThinkingFormat(),
        capabilities: { vision: caps.vision, audio: caps.audio },
        audioBlob: null,
      },
      Comlink.proxy(noop),
    );

    if (result.error) {
      showError(`Title generation failed: ${result.error}`);
      return;
    }

    const title = cleanGeneratedTitle(result.text);
    if (title) {
      conv.title = title;
      saveConversations();
    } else {
      showWarning("AI couldn't produce a title. Try again.");
    }
  } catch (err: any) {
    console.error("Title generation error:", err);
    showError(`Title generation failed: ${err?.message || "Unknown error"}`);
  } finally {
    regeneratingTitles.delete(id);
    isGenerating = false;
    renderConversationList();
  }
}

// ── Folder management ──────────────────────────────────────

function createFolder(name?: string) {
  const folderName = name || prompt("Folder name:");
  if (!folderName?.trim()) return null;
  const folder: Folder = { id: crypto.randomUUID(), name: folderName.trim() };
  folders.push(folder);
  saveFolders();
  renderConversationList();
  return folder;
}

function deleteFolder(id: string) {
  folders = folders.filter((f) => f.id !== id);
  saveFolders();
  for (const c of conversations) {
    if (c.folderId === id) c.folderId = null;
  }
  saveConversations();
  renderConversationList();
}

function renameFolder(id: string) {
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;
  const newName = prompt("Rename folder:", folder.name);
  if (newName !== null && newName.trim()) {
    folder.name = newName.trim();
    saveFolders();
    renderConversationList();
  }
}

function toggleFolderCollapse(id: string) {
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  saveFolders();
  renderConversationList();
}

// ── UI rendering ───────────────────────────────────────────

async function checkCachedModels() {
  cachedModelIds.clear();
  try {
    const cache = await caches.open("transformers-cache");
    const keys = await cache.keys();
    const urls = keys.map((r) => r.url);
    for (const m of MODELS) {
      if (urls.some((u) => u.includes(encodeURIComponent(m.id)) || u.includes(m.id))) {
        cachedModelIds.add(m.id);
      }
    }
  } catch {
    // Cache API unavailable
  }
}

interface CachedModelInfo {
  id: string;
  name: string;
  bytes: number;
  fileCount: number;
}

function urlBelongsToModel(url: string, modelId: string): boolean {
  return url.includes(encodeURIComponent(modelId)) || url.includes(modelId);
}

async function getCachedModelsInfo(): Promise<CachedModelInfo[]> {
  if (typeof caches === "undefined") return [];

  try {
    const cache = await caches.open("transformers-cache");
    const requests = await cache.keys();

    const totals = new Map<string, { bytes: number; fileCount: number }>();

    await Promise.all(
      requests.map(async (req) => {
        const model = MODELS.find((m) => urlBelongsToModel(req.url, m.id));
        if (!model) return;

        const response = await cache.match(req);
        let size = 0;
        const lenHeader = response?.headers.get("content-length");
        if (lenHeader) {
          size = parseInt(lenHeader, 10) || 0;
        } else if (response) {
          // Fallback: read the body. Should be rare; cached HF responses usually expose content-length.
          try {
            const blob = await response.clone().blob();
            size = blob.size;
          } catch {
            size = 0;
          }
        }

        const entry = totals.get(model.id) ?? { bytes: 0, fileCount: 0 };
        entry.bytes += size;
        entry.fileCount += 1;
        totals.set(model.id, entry);
      }),
    );

    return MODELS
      .filter((m) => totals.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        bytes: totals.get(m.id)!.bytes,
        fileCount: totals.get(m.id)!.fileCount,
      }))
      .sort((a, b) => b.bytes - a.bytes);
  } catch {
    return [];
  }
}

async function deleteCachedModel(modelId: string): Promise<void> {
  if (typeof caches === "undefined") return;

  try {
    const cache = await caches.open("transformers-cache");
    const requests = await cache.keys();
    await Promise.all(
      requests
        .filter((req) => urlBelongsToModel(req.url, modelId))
        .map((req) => cache.delete(req)),
    );

    if (modelId === currentModelId) {
      await getPlaygroundApi().dispose();
      currentModelId = "";
      modelReady = false;
      modelHasProcessor = false;
      updateModelStatus("idle", "Not loaded");
      disableInput();
      updateContextIndicator();
    }
  } catch (err) {
    console.error("Failed to delete model cache:", err);
  }
}

async function deleteAllCachedModels(): Promise<void> {
  if (typeof caches === "undefined") return;

  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.includes("transformers") || name.includes("onnx"))
        .map((name) => caches.delete(name)),
    );

    await getPlaygroundApi().dispose();
    currentModelId = "";
    modelReady = false;
    modelHasProcessor = false;
    updateModelStatus("idle", "Cache cleared");
    disableInput();
    updateContextIndicator();
  } catch (err) {
    console.error("Failed to clear all caches:", err);
  }
}

function renderCapabilityBadges(caps: ModelCapabilities): string {
  const badges: string[] = [];
  const cls = "rounded px-1 py-px text-[9px] font-mono tracking-wide";
  if (caps.vision) badges.push(`<span class="${cls} bg-info/10 text-info">vision</span>`);
  if (caps.audio) badges.push(`<span class="${cls} bg-accent/10 text-accent">audio</span>`);
  if (caps.thinking) badges.push(`<span class="${cls} bg-warning/10 text-warning">thinking</span>`);
  if (badges.length === 0) badges.push(`<span class="${cls} bg-edge/30 text-muted">text</span>`);
  return badges.join("");
}

function renderModelSelect() {
  const dropdown = $["pg-model-dropdown"];
  if (!dropdown) return;

  dropdown.innerHTML = MODELS.map((m) => {
    const isLoaded = m.id === currentModelId;
    const isCached = !isLoaded && cachedModelIds.has(m.id);

    let dotClass: string;
    let nameClass: string;
    let bgClass: string;
    let badge = "";

    if (isLoaded) {
      dotClass = "bg-accent";
      nameClass = "text-accent";
      bgClass = "bg-accent/5";
      badge = `<span class="ml-1.5 rounded-full bg-accent/15 px-1.5 py-px text-[9px] font-medium text-accent uppercase tracking-wider">Active</span>`;
    } else if (isCached) {
      dotClass = "bg-warning";
      nameClass = "text-primary";
      bgClass = "";
      badge = `<span class="ml-1.5 rounded-full bg-warning/15 px-1.5 py-px text-[9px] font-medium text-warning uppercase tracking-wider">Downloaded</span>`;
    } else {
      dotClass = "bg-edge";
      nameClass = "text-primary";
      bgClass = "";
    }

    return `
      <button
        class="pg-model-option flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover cursor-pointer ${bgClass}"
        data-model-id="${m.id}"
        role="option"
        aria-selected="${isLoaded}"
      >
        <div class="mt-1 size-2 shrink-0 rounded-full ${dotClass}"></div>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <span class="font-mono text-xs font-medium ${nameClass}">${escapeHtml(m.name)}${badge}</span>
            <span class="shrink-0 font-mono text-[10px] text-muted">${m.sizeHint}</span>
          </div>
          <p class="mt-0.5 text-[11px] text-muted">${escapeHtml(m.provider)} · ${m.params} · ${escapeHtml(m.description)}</p>
          <div class="mt-1 flex gap-1">${renderCapabilityBadges(m.capabilities)}</div>
        </div>
      </button>
    `;
  }).join('<div class="border-t border-edge/30"></div>');

  updateModelTriggerLabel();
}

function updateModelTriggerLabel() {
  const label = $["pg-model-trigger-label"];
  if (!label) return;

  const model = MODELS.find((m) => m.id === currentModelId);
  if (model) {
    label.textContent = model.name;
  } else if (settings.lastModelId) {
    const lastModel = MODELS.find((m) => m.id === settings.lastModelId);
    label.textContent = lastModel?.name || "Select model...";
  } else {
    label.textContent = "Select model...";
  }
}

async function toggleModelDropdown(forceClose = false) {
  const dropdown = $["pg-model-dropdown"];
  const trigger = $["pg-model-trigger"];
  if (!dropdown || !trigger) return;

  const isOpen = !dropdown.classList.contains("hidden");
  if (isOpen || forceClose) {
    dropdown.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
  } else {
    await checkCachedModels();
    renderModelSelect();
    dropdown.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
  }
}

function getTimeGroup(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOf7Days = startOfToday - 6 * 86_400_000;

  if (ts >= startOfToday) return "Today";
  if (ts >= startOfYesterday) return "Yesterday";
  if (ts >= startOf7Days) return "Last 7 days";
  return d.toLocaleDateString("en-US", { month: "short", year: now.getFullYear() !== d.getFullYear() ? "numeric" : undefined });
}

function renderConvItem(c: Conversation): string {
  const isActive = c.id === activeConversationId;
  const title = escapeHtml(c.title);
  const pinIcon = c.pinned ? '<svg class="size-3 shrink-0 text-accent/50" viewBox="0 0 24 24" fill="currentColor"><path d="M16 2l5 5-3.2 3.2 1.4 1.4L21 13.4 10.6 3l1.8-1.8L13.8 2.6 17 -0.6zM2 22l5.3-5.3 2.1 2.1L22 6.2 17.8 2 5.2 14.6l2.1 2.1L2 22z"/></svg>' : "";

  const isRegenerating = regeneratingTitles.has(c.id);
  const refreshIcon = isRegenerating
    ? '<svg class="size-3 pg-loading-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
    : '<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  const refreshVisibility = isRegenerating ? "opacity-100" : "opacity-0 group-hover:opacity-100";
  const refreshTitle = isRegenerating ? "Generating title…" : "Regenerate title with AI";
  const refreshBtn = `<button class="pg-conv-refresh shrink-0 ${refreshVisibility} flex size-5 items-center justify-center rounded text-muted transition-all hover:bg-surface-hover hover:text-accent cursor-pointer disabled:cursor-wait" data-refresh-id="${c.id}" aria-label="${refreshTitle}" title="${refreshTitle}"${isRegenerating ? " disabled" : ""}>${refreshIcon}</button>`;

  return `<div class="pg-conv-item group flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left transition-colors cursor-pointer ${isActive ? "bg-surface-hover text-primary" : "text-secondary hover:bg-surface-hover/50 hover:text-primary"}" data-conv-id="${c.id}">${pinIcon}<span class="flex-1 min-w-0 truncate text-[12px]">${title}</span>${refreshBtn}<button class="pg-conv-menu shrink-0 opacity-0 group-hover:opacity-100 flex size-5 items-center justify-center rounded text-muted transition-all hover:bg-surface-hover hover:text-primary cursor-pointer" data-menu-id="${c.id}" aria-label="Menu"><svg class="size-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button></div>`;
}

function renderSectionLabel(label: string): string {
  return `<div class="px-2 pt-2 pb-0.5 first:pt-0.5"><span class="font-mono text-[10px] font-medium text-muted/60 uppercase tracking-wider">${escapeHtml(label)}</span></div>`;
}

function renderConversationList() {
  const list = $["pg-conversation-list"];
  if (!list) return;

  const q = searchQuery.toLowerCase().trim();
  let filtered = conversations.filter((c) => {
    if (q && !c.title.toLowerCase().includes(q)) return false;
    return true;
  });

  if (showArchived) {
    const archived = filtered.filter((c) => c.archived);
    if (archived.length === 0) {
      list.innerHTML = '<p class="px-2 py-6 text-center font-mono text-[11px] text-muted/50">No archived conversations</p>';
    } else {
      list.innerHTML = renderSectionLabel("Archived") + archived.map(renderConvItem).join("");
    }
    updateSidebarFooter();
    return;
  }

  const visible = filtered.filter((c) => !c.archived);

  if (visible.length === 0 && folders.length === 0) {
    list.innerHTML = '<p class="px-2 py-6 text-center font-mono text-[11px] text-muted/50">No conversations yet</p>';
    updateSidebarFooter();
    return;
  }

  let html = "";

  const pinned = visible.filter((c) => c.pinned && !c.folderId);
  if (pinned.length > 0) {
    html += renderSectionLabel("Pinned");
    html += pinned.map(renderConvItem).join("");
  }

  for (const folder of folders) {
    const folderConvs = visible.filter((c) => c.folderId === folder.id);
    html += `<div class="pg-folder mt-1" data-folder-id="${folder.id}">`;
    html += `<button class="pg-folder-header group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left cursor-pointer transition-colors hover:bg-surface-hover/50" data-toggle-folder="${folder.id}">`;
    html += `<svg class="size-3 text-muted transition-transform ${folder.collapsed ? "" : "rotate-90"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 6 15 12 9 18"/></svg>`;
    html += `<svg class="size-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    html += `<span class="flex-1 min-w-0 truncate text-[11px] font-medium text-secondary">${escapeHtml(folder.name)}</span>`;
    html += `<span class="text-[10px] text-muted/50 font-mono">${folderConvs.length}</span>`;
    html += `<button class="pg-folder-menu shrink-0 opacity-0 group-hover:opacity-100 flex size-5 items-center justify-center rounded text-muted transition-all hover:text-primary cursor-pointer" data-folder-menu-id="${folder.id}" aria-label="Folder menu"><svg class="size-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>`;
    html += `</button>`;
    if (!folder.collapsed && folderConvs.length > 0) {
      html += `<div class="pl-3">${folderConvs.map(renderConvItem).join("")}</div>`;
    }
    html += `</div>`;
  }

  const ungrouped = visible.filter((c) => !c.pinned && !c.folderId);
  if (ungrouped.length > 0) {
    const groups = new Map<string, Conversation[]>();
    for (const c of ungrouped) {
      const group = getTimeGroup(c.updatedAt);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(c);
    }
    for (const [label, convs] of groups) {
      html += renderSectionLabel(label);
      html += convs.map(renderConvItem).join("");
    }
  }

  list.innerHTML = html || '<p class="px-2 py-6 text-center font-mono text-[11px] text-muted/50">No conversations yet</p>';
  updateSidebarFooter();
}

function updateSidebarFooter() {
  const archivedVisible = updateArchivedToggle();
  const clearAllVisible = updateClearAllButton();
  const footer = $["pg-sidebar-footer"];
  if (!footer) return;
  if (archivedVisible || clearAllVisible) {
    footer.classList.remove("hidden");
  } else {
    footer.classList.add("hidden");
  }
}

function updateArchivedToggle(): boolean {
  const btn = $["pg-archived-toggle"];
  if (!btn) return false;
  const count = conversations.filter((c) => c.archived).length;
  if (count === 0 && !showArchived) {
    btn.classList.add("hidden");
    btn.classList.remove("flex");
    return false;
  }
  btn.classList.remove("hidden");
  btn.classList.add("flex");
  const icon = showArchived
    ? '<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>'
    : '<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>';
  btn.innerHTML = `${icon}<span>${showArchived ? "Back to chats" : `Archived (${count})`}</span>`;
  return true;
}

function updateClearAllButton(): boolean {
  const btn = $["pg-clear-all"];
  if (!btn) return false;
  if (conversations.length === 0) {
    btn.classList.add("hidden");
    btn.classList.remove("flex");
    return false;
  }
  btn.classList.remove("hidden");
  btn.classList.add("flex");
  return true;
}

function showContextMenu(convId: string, x: number, y: number) {
  const menu = $["pg-context-menu"];
  if (!menu) return;

  const conv = conversations.find((c) => c.id === convId);
  if (!conv) return;

  const folderItems = folders.map((f) =>
    `<button class="pg-ctx-item" data-ctx-action="move-to-folder" data-ctx-folder="${f.id}" data-ctx-id="${convId}"><svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>${escapeHtml(f.name)}</button>`
  ).join("");

  const moveSubmenu = `
    <div class="pg-ctx-submenu">
      <button class="pg-ctx-item pg-ctx-has-sub" data-ctx-expand="move"><svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Move to folder<svg class="size-3 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 6 15 12 9 18"/></svg></button>
      <div class="pg-ctx-sub hidden" data-ctx-sub="move">
        ${conv.folderId ? `<button class="pg-ctx-item" data-ctx-action="remove-from-folder" data-ctx-id="${convId}"><svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Remove from folder</button>` : ""}
        ${folderItems}
        <div class="border-t border-edge/30 my-0.5"></div>
        <button class="pg-ctx-item" data-ctx-action="new-folder" data-ctx-id="${convId}"><svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New folder</button>
      </div>
    </div>`;

  menu.innerHTML = `
    <button class="pg-ctx-item" data-ctx-action="${conv.pinned ? "unpin" : "pin"}" data-ctx-id="${convId}">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="${conv.pinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
      ${conv.pinned ? "Unpin" : "Pin to top"}
    </button>
    ${moveSubmenu}
    <button class="pg-ctx-item" data-ctx-action="rename" data-ctx-id="${convId}">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
      Rename
    </button>
    <button class="pg-ctx-item" data-ctx-action="regen-title" data-ctx-id="${convId}">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      Regenerate title (AI)
    </button>
    <button class="pg-ctx-item" data-ctx-action="${conv.archived ? "unarchive" : "archive"}" data-ctx-id="${convId}">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>
      ${conv.archived ? "Unarchive" : "Archive"}
    </button>
    <div class="border-t border-edge/30 my-0.5"></div>
    <button class="pg-ctx-item pg-ctx-danger" data-ctx-action="delete" data-ctx-id="${convId}">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Delete
    </button>
  `;

  const rect = document.body.getBoundingClientRect();
  const menuW = 192;
  const menuH = menu.children.length * 32 + 20;
  let left = x;
  let top = y;
  if (left + menuW > rect.width) left = rect.width - menuW - 8;
  if (top + menuH > window.innerHeight) top = window.innerHeight - menuH - 8;
  if (left < 4) left = 4;
  if (top < 4) top = 4;

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.classList.remove("hidden");

  menu.querySelectorAll("[data-ctx-expand]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const subId = (btn as HTMLElement).dataset.ctxExpand;
      const sub = menu.querySelector(`[data-ctx-sub="${subId}"]`);
      if (sub) sub.classList.toggle("hidden");
    });
  });
}

function hideContextMenu() {
  const menu = $["pg-context-menu"];
  if (menu) menu.classList.add("hidden");
}

function showFolderContextMenu(folderId: string, x: number, y: number) {
  const menu = $["pg-context-menu"];
  if (!menu) return;

  menu.innerHTML = `
    <button class="pg-ctx-item" data-ctx-action="rename-folder" data-ctx-id="${folderId}">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
      Rename folder
    </button>
    <button class="pg-ctx-item pg-ctx-danger" data-ctx-action="delete-folder" data-ctx-id="${folderId}">
      <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Delete folder
    </button>
  `;

  const menuW = 192;
  let left = x;
  let top = y;
  if (left + menuW > window.innerWidth) left = window.innerWidth - menuW - 8;
  if (top + 80 > window.innerHeight) top = window.innerHeight - 80 - 8;

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.classList.remove("hidden");
}

function renderMessages() {
  const container = $["pg-messages"];
  const welcome = $["pg-welcome"];
  if (!container) {
    updateContextIndicator();
    return;
  }

  const conv = getActiveConversation();

  if (!conv || conv.messages.length === 0) {
    if (welcome) welcome.style.display = "";
    const existing = container.querySelector(".pg-messages-inner");
    if (existing) existing.remove();
    updateContextIndicator();
    return;
  }

  if (welcome) welcome.style.display = "none";

  const visibleMessages = conv.messages.filter((m) => m.role !== "system");
  let inner = container.querySelector(".pg-messages-inner") as HTMLElement;
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "pg-messages-inner max-w-3xl mx-auto px-4 py-6 space-y-6";
    container.appendChild(inner);
  }

  inner.innerHTML = visibleMessages
    .map((m) => {
      if (m.role === "user") {
        const imagesHtml = m.images?.length
          ? `<div class="flex gap-2 flex-wrap justify-end mb-2">${m.images.map((url) => url ? `<img src="${url}" class="h-40 max-w-[280px] rounded-xl object-cover border border-accent/10" />` : `<div class="h-40 w-40 rounded-xl border border-accent/10 bg-accent/5 flex items-center justify-center text-muted/40 text-xs">Image</div>`).join("")}</div>`
          : "";
        const audioHtml = m.audioUrl
          ? `<div class="flex justify-end mb-2"><audio src="${m.audioUrl}" controls class="h-8 max-w-[240px]"></audio></div>`
          : "";
        return `
          <div class="flex justify-end">
            <div class="max-w-[85%]">
              ${imagesHtml}
              ${audioHtml}
              <div class="rounded-2xl rounded-br-md bg-accent/10 border border-accent/20 px-4 py-2.5">
                <p class="text-sm text-primary whitespace-pre-wrap">${escapeHtml(m.content)}</p>
              </div>
            </div>
          </div>
        `;
      }
      const messageModelId = m.modelId ?? conv.modelId;
      const statsHtml = m.stats && m.stats.tps > 0
        ? `<div class="mt-1 font-mono text-[10px] text-muted/60">${escapeHtml(getModelDisplayName(messageModelId))} · ${m.stats.tps.toFixed(1)} tok/s · ${m.stats.numTokens} tokens · ${(m.stats.elapsedMs / 1000).toFixed(1)}s</div>`
        : "";
      const { thinking, response } = separateThinkingSaved(m.content);
      const displayContent = thinking ? response : m.content;
      const thinkingHtml = renderThinkingCollapsed(thinking, m.stats?.thinkingSecs);
      return `
        <div class="flex justify-start">
          <div class="max-w-[85%] space-y-1">
            <div class="pg-assistant-msg text-sm text-secondary leading-relaxed">
              ${thinkingHtml}${renderMarkdown(displayContent)}
            </div>
            ${statsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  scrollToBottom();
  updateContextIndicator();
}

function addStreamingMessage() {
  const container = $["pg-messages"];
  const welcome = $["pg-welcome"];
  if (!container) return;

  if (welcome) welcome.style.display = "none";

  let inner = container.querySelector(".pg-messages-inner") as HTMLElement;
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "pg-messages-inner max-w-3xl mx-auto px-4 py-6 space-y-6";
    container.appendChild(inner);
  }

  const msgEl = document.createElement("div");
  msgEl.className = "flex justify-start";
  msgEl.id = "pg-streaming-msg";
  msgEl.innerHTML = `
    <div class="max-w-[85%] space-y-1">
      <div class="pg-assistant-msg text-sm text-secondary leading-relaxed">
        <span class="pg-cursor"></span>
      </div>
    </div>
  `;
  inner.appendChild(msgEl);
  scrollToBottom();
}

function insertCursorInline(html: string): string {
  const cursor = '<span class="pg-cursor"></span>';
  const closingBlockRe = /<\/(p|li|h[1-6]|pre|div|blockquote)>\s*$/i;
  const match = html.match(closingBlockRe);
  if (match) {
    const idx = html.lastIndexOf(match[0]);
    return html.slice(0, idx) + cursor + html.slice(idx);
  }
  return html + cursor;
}

function scheduleStreamingUpdate(text: string, tps: number, numTokens: number) {
  pendingStreamingArgs = { text, tps, numTokens };
  if (pendingStreamingFrame) return;

  pendingStreamingFrame = true;
  requestAnimationFrame(() => {
    pendingStreamingFrame = false;
    flushStreamingUpdate();
  });
}

function flushStreamingUpdate() {
  if (!pendingStreamingArgs) return;

  const { text, tps, numTokens } = pendingStreamingArgs;
  pendingStreamingArgs = null;
  updateStreamingMessage(text, tps, numTokens);
}

function updateStreamingMessage(text: string, tps = 0, numTokens = 0) {
  const msgEl = document.getElementById("pg-streaming-msg");
  if (!msgEl) return;

  const contentEl = msgEl.querySelector(".pg-assistant-msg");
  if (!contentEl) return;

  const { thinking, response, isThinking } = separateThinking(text);
  let html = "";

  if (thinking || isThinking) {
    if (thinkingStartTime === null) {
      thinkingStartTime = performance.now();
    }
  }

  if (isThinking) {
    const elapsed = thinkingStartTime ? (performance.now() - thinkingStartTime) / 1000 : 0;
    html += renderThinkingLive(thinking, elapsed);
    html += '<span class="pg-cursor"></span>';
  } else if (thinking) {
    if (thinkingStartTime) {
      thinkingDurationSecs = (performance.now() - thinkingStartTime) / 1000;
    }
    html += renderThinkingCollapsed(thinking, thinkingDurationSecs);
    const displayText = response;
    if (displayText) {
      html += insertCursorInline(renderMarkdown(displayText));
    } else {
      html += '<span class="pg-cursor"></span>';
    }
  } else {
    if (text) {
      html += insertCursorInline(renderMarkdown(text));
    } else {
      html += '<span class="pg-cursor"></span>';
    }
  }

  contentEl.innerHTML = html;

  const liveText = contentEl.querySelector(".pg-thinking-live-text") as HTMLElement;
  if (liveText) {
    liveText.scrollTop = liveText.scrollHeight;
  }

  let statsEl = msgEl.querySelector(".pg-gen-stats") as HTMLElement;
  if (tps > 0) {
    if (!statsEl) {
      statsEl = document.createElement("div");
      statsEl.className = "pg-gen-stats mt-1 font-mono text-[10px] text-muted/60";
      msgEl.querySelector(".max-w-\\[85\\%\\]")?.appendChild(statsEl);
    }
    statsEl.textContent = `${getModelDisplayName()} · ${tps.toFixed(1)} tok/s · ${numTokens} tokens`;
  }

  scrollToBottom();
}

function finalizeStreamingMessage(result?: GenerationResult) {
  const msgEl = document.getElementById("pg-streaming-msg");
  if (!msgEl) return;

  msgEl.removeAttribute("id");
  const cursor = msgEl.querySelector(".pg-cursor");
  if (cursor) cursor.remove();

  if (result && result.numTokens > 0 && result.tps > 0) {
    let statsEl = msgEl.querySelector(".pg-gen-stats") as HTMLElement;
    if (!statsEl) {
      statsEl = document.createElement("div");
      statsEl.className = "pg-gen-stats mt-1 font-mono text-[10px] text-muted/60";
      msgEl.querySelector(".max-w-\\[85\\%\\]")?.appendChild(statsEl);
    }
    const elapsed = (result.elapsedMs / 1000).toFixed(1);
    statsEl.textContent = `${getModelDisplayName()} · ${result.tps.toFixed(1)} tok/s · ${result.numTokens} tokens · ${elapsed}s`;
  }
}

function scrollToBottom() {
  const container = $["pg-messages"];
  if (!container) return;
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function updateModelStatus(state: "idle" | "loading" | "ready" | "error", text: string) {
  const dot = $["pg-model-trigger-status"];
  const statusEl = $["pg-model-status"];
  const statusTxt = statusEl?.querySelector(".pg-status-text") as HTMLElement;

  if (statusTxt) statusTxt.textContent = text;

  if (dot) {
    dot.className = "pg-status-dot size-1.5 rounded-full shrink-0";
    switch (state) {
      case "ready":
        dot.classList.add("bg-accent");
        break;
      case "loading":
        dot.classList.add("bg-warning", "animate-pulse");
        break;
      case "error":
        dot.classList.add("bg-danger");
        break;
      default:
        dot.classList.add("bg-muted");
    }
  }

  updateModelTriggerLabel();
}

function updateModelInfo() {
  const info = $["pg-model-info"];
  if (!info) return;

  if (!currentModelId) {
    info.innerHTML = "<p>No model selected</p>";
    return;
  }

  const model = MODELS.find((m) => m.id === currentModelId);
  if (!model) return;

  info.innerHTML = `
    <p><span class="text-secondary">Model:</span> ${escapeHtml(model.name)}</p>
    <p><span class="text-secondary">Parameters:</span> ${model.params}</p>
    <p><span class="text-secondary">Provider:</span> ${model.provider}</p>
    <p><span class="text-secondary">Size:</span> ${model.sizeHint}</p>
    <p><span class="text-secondary">Device:</span> ${hasWebGPU ? "WebGPU" : "WASM (CPU)"}</p>
    <p><span class="text-secondary">HF ID:</span> ${escapeHtml(model.id)}</p>
    <div class="mt-2 flex gap-1">${renderCapabilityBadges(model.capabilities)}</div>
  `;
}

async function renderCachedModelsList() {
  const list = $["pg-cached-list"];
  const total = $["pg-cached-total"];
  const deleteAll = $["pg-delete-all-cache"];
  if (!list) return;

  list.innerHTML = `<p class="font-mono text-[10px] text-muted/60 italic">Loading...</p>`;

  const cached = await getCachedModelsInfo();

  if (cached.length === 0) {
    list.innerHTML = `<p class="font-mono text-[10px] text-muted/60">No cached models</p>`;
    if (total) total.textContent = "";
    if (deleteAll) {
      deleteAll.classList.add("hidden");
    }
    return;
  }

  if (total) {
    const sum = cached.reduce((acc, m) => acc + m.bytes, 0);
    total.textContent = formatBytes(sum);
  }
  if (deleteAll) {
    deleteAll.classList.remove("hidden");
  }

  list.innerHTML = cached
    .map((m) => `
      <div class="flex items-center gap-2 rounded-lg border border-edge/40 bg-surface-card px-2.5 py-2">
        <div class="min-w-0 flex-1">
          <p class="truncate font-mono text-[11px] text-primary">${escapeHtml(m.name)}</p>
          <p class="font-mono text-[10px] text-muted">${formatBytes(m.bytes)} · ${m.fileCount} ${m.fileCount === 1 ? "file" : "files"}</p>
        </div>
        <button
          class="pg-delete-cached shrink-0 flex size-7 items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
          data-cached-id="${escapeHtml(m.id)}"
          aria-label="Delete ${escapeHtml(m.name)} cache"
          title="Delete ${escapeHtml(m.name)} cache"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `)
    .join("");

  list.querySelectorAll(".pg-delete-cached").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.cachedId;
      if (!id) return;
      const target = MODELS.find((m) => m.id === id);
      if (!target) return;
      if (!confirm(`Delete cached data for ${target.name}?`)) return;
      await deleteCachedModel(id);
      await checkCachedModels();
      renderModelSelect();
      await renderCachedModelsList();
    });
  });
}

// ── Loading overlay ────────────────────────────────────────

function showLoading(modelId: string) {
  const model = MODELS.find((m) => m.id === modelId);
  const container = $["pg-messages"];
  const welcome = $["pg-welcome"];
  if (!container) return;

  if (welcome) welcome.style.display = "none";

  hideLoading();

  let inner = container.querySelector(".pg-messages-inner") as HTMLElement;
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "pg-messages-inner max-w-3xl mx-auto px-4 py-6 space-y-6";
    container.appendChild(inner);
  }

  const card = document.createElement("div");
  card.id = "pg-loading-card";
  card.className = "flex justify-center";
  card.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl border border-accent/20 bg-surface-card p-5 space-y-3">
      <div class="flex items-center gap-3">
        <div class="pg-loading-spinner size-5 shrink-0 rounded-full border-2 border-accent/30 border-t-accent"></div>
        <div class="min-w-0">
          <p class="font-mono text-xs text-primary truncate" data-loading="title">Loading ${escapeHtml(model?.name || modelId)}...</p>
          <p class="font-mono text-[10px] text-muted" data-loading="subtitle">Preparing...</p>
        </div>
      </div>
      <div class="space-y-1">
        <div class="h-1.5 overflow-hidden rounded-full bg-surface-hover">
          <div class="h-full rounded-full bg-accent transition-all duration-300 ease-out" data-loading="bar" style="width:0%"></div>
        </div>
        <div class="flex justify-between font-mono text-[10px] text-muted">
          <span data-loading="pct">0%</span>
          <span data-loading="size"></span>
        </div>
      </div>
      <div class="max-h-24 space-y-0.5 overflow-y-auto" data-loading="files"></div>
      <button
        data-loading="cancel"
        class="w-full rounded-lg border border-edge/60 px-2.5 py-1.5 font-mono text-[11px] text-secondary transition-colors hover:bg-surface-hover hover:text-primary cursor-pointer"
      >Cancel</button>
    </div>
  `;
  inner.appendChild(card);

  card.querySelector('[data-loading="cancel"]')?.addEventListener("click", () => {
    abortWorkerWork();
    hideLoading();
    updateModelStatus("idle", "Cancelled");
  });

  mountLoadingTips(inner);

  scrollToBottom();
}

function mountLoadingTips(inner: HTMLElement) {
  const startIndex = Math.floor(Math.random() * LOADING_TIPS.length);
  const tip = document.createElement("div");
  tip.id = "pg-loading-tip";
  tip.className = "flex justify-center";
  tip.innerHTML = `
    <div class="w-full max-w-sm">
      <div class="flex items-start gap-2 px-1 pt-1 font-mono text-[10px] text-muted/80">
        <svg class="size-3.5 shrink-0 mt-px text-accent/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 18h6"/>
          <path d="M10 22h4"/>
          <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v.3h6V17c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>
        </svg>
        <p
          class="flex-1 min-w-0 leading-relaxed transition-opacity duration-300"
          data-loading-tip
          aria-live="polite"
        >${escapeHtml(LOADING_TIPS[startIndex])}</p>
      </div>
    </div>
  `;
  inner.appendChild(tip);

  let index = startIndex;
  loadingTipTimer = window.setInterval(() => {
    const el = document.querySelector<HTMLElement>('#pg-loading-tip [data-loading-tip]');
    if (!el) return;
    el.style.opacity = "0";
    window.setTimeout(() => {
      index = (index + 1) % LOADING_TIPS.length;
      el.textContent = LOADING_TIPS[index];
      el.style.opacity = "1";
    }, 280);
  }, LOADING_TIP_INTERVAL_MS);
}

function hideLoading() {
  if (loadingTipTimer !== null) {
    clearInterval(loadingTipTimer);
    loadingTipTimer = null;
  }
  document.getElementById("pg-loading-card")?.remove();
  document.getElementById("pg-loading-tip")?.remove();
}

function getLoadingEl(attr: string): HTMLElement | null {
  return document.querySelector(`#pg-loading-card [data-loading="${attr}"]`);
}

function updateLoadingSubtitle(text: string) {
  const el = getLoadingEl("subtitle");
  if (el) el.textContent = text;
}

function updateLoadingProgress(pct: number, loaded: number, total: number) {
  const bar = getLoadingEl("bar");
  const pctEl = getLoadingEl("pct");
  const sizeEl = getLoadingEl("size");

  const clamped = Math.min(Math.max(pct, 0), 100);
  if (bar) bar.style.width = `${clamped}%`;
  if (pctEl) pctEl.textContent = `${Math.round(clamped)}%`;
  if (sizeEl && total > 0) {
    sizeEl.textContent = `${formatBytes(loaded)} / ${formatBytes(total)}`;
  }
}

function renderLoadingFiles(files: Map<string, FileProgress>) {
  const container = getLoadingEl("files");
  if (!container) return;

  const entries = [...files.entries()].slice(-5);
  container.innerHTML = entries
    .map(([, fp]) => {
      const name = fp.file.split("/").pop() || fp.file;
      const shortName = name.length > 28 ? name.slice(0, 25) + "..." : name;
      const pct = fp.total > 0 ? (fp.loaded / fp.total) * 100 : 0;
      return `
        <div class="flex items-center gap-2 font-mono text-[10px]">
          <span class="truncate flex-1 ${fp.done ? "text-accent" : "text-muted"}">${fp.done ? "✓" : "↓"} ${escapeHtml(shortName)}</span>
          ${
            fp.done
              ? ""
              : `<div class="w-14 h-1 rounded-full bg-surface-hover overflow-hidden shrink-0"><div class="h-full rounded-full bg-accent/60 transition-all" style="width:${pct}%"></div></div>`
          }
        </div>
      `;
    })
    .join("");
  scrollToBottom();
}

// ── Input / buttons ────────────────────────────────────────

function enableInput() {
  const input = $["pg-input"] as HTMLTextAreaElement;
  const send = $["pg-send"] as HTMLButtonElement;
  const attach = $["pg-attach-btn"] as HTMLButtonElement;
  const mic = $["pg-mic-btn"] as HTMLButtonElement;
  const fileInput = $["pg-file-input"] as HTMLInputElement;

  if (input) {
    input.disabled = false;
    input.placeholder = "Type your message...";
    input.focus();
  }
  if (send) send.disabled = false;

  const caps = getActiveCapabilities();
  const supportsFiles = caps.vision;

  if (attach) {
    attach.disabled = !supportsFiles;
    attach.title = supportsFiles ? "Attach file" : "This model does not support file attachments";
  }

  if (fileInput) {
    fileInput.accept = caps.vision
      ? "image/*,.pdf,.txt,.md,.csv,.json,.xml,.html"
      : ".pdf,.txt,.md,.csv,.json,.xml,.html";
  }

  if (mic) {
    mic.disabled = false;
    mic.title = caps.audio ? "Record audio (native)" : "Voice-to-text";
  }

  updateContextIndicator();
}

function disableInput() {
  const input = $["pg-input"] as HTMLTextAreaElement;
  const send = $["pg-send"] as HTMLButtonElement;
  const attach = $["pg-attach-btn"] as HTMLButtonElement;
  const mic = $["pg-mic-btn"] as HTMLButtonElement;

  if (input) input.disabled = true;
  if (send) send.disabled = true;
  if (attach) attach.disabled = true;
  if (mic) mic.disabled = true;
  updateContextIndicator();
}

function updateInputState() {
  if (modelReady) {
    enableInput();
  } else {
    disableInput();
  }
}

function showStopButton() {
  const stop = $["pg-stop"];
  if (stop) {
    (stop as HTMLElement).style.display = "";
    stop.classList.remove("hidden");
    stop.classList.add("flex");
  }
}

function hideStopButton() {
  const stop = $["pg-stop"];
  const input = $["pg-input"] as HTMLTextAreaElement;

  if (stop) {
    stop.classList.add("hidden");
    stop.classList.remove("flex");
  }
  if (input) focusInputIfIdle(input);
}

function focusInputIfIdle(input: HTMLTextAreaElement) {
  const active = document.activeElement;
  if (
    active &&
    active !== input &&
    active !== document.body &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      (active as HTMLElement).isContentEditable)
  ) {
    return;
  }
  requestAnimationFrame(() => {
    if (!input.isConnected || input.disabled) return;
    input.focus({ preventScroll: true });
  });
}

function showError(message: string) {
  const container = $["pg-messages"];
  if (!container) return;

  let inner = container.querySelector(".pg-messages-inner") as HTMLElement;
  if (!inner) {
    const welcome = $["pg-welcome"];
    if (welcome) welcome.style.display = "none";
    inner = document.createElement("div");
    inner.className = "pg-messages-inner max-w-3xl mx-auto px-4 py-6 space-y-6";
    container.appendChild(inner);
  }

  const errorEl = document.createElement("div");
  errorEl.className = "flex justify-center";
  errorEl.innerHTML = `
    <div class="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-xs text-danger font-mono">
      ${escapeHtml(message)}
    </div>
  `;
  inner.appendChild(errorEl);
  scrollToBottom();
}

function showWarning(message: string) {
  const container = $["pg-messages"];
  if (!container) return;

  let inner = container.querySelector(".pg-messages-inner") as HTMLElement;
  if (!inner) {
    const welcome = $["pg-welcome"];
    if (welcome) welcome.style.display = "none";
    inner = document.createElement("div");
    inner.className = "pg-messages-inner max-w-3xl mx-auto px-4 py-6 space-y-6";
    container.appendChild(inner);
  }

  const el = document.createElement("div");
  el.className = "flex justify-center";
  el.innerHTML = `
    <div class="rounded-xl border border-warning/30 bg-warning/5 px-4 py-2.5 text-xs text-warning font-mono">
      ${escapeHtml(message)}
    </div>
  `;
  inner.appendChild(el);
  scrollToBottom();
}

// ── Sidebar ────────────────────────────────────────────────

function openSidebar() {
  const sidebar = $["pg-sidebar"];
  const backdrop = $["pg-sidebar-backdrop"];
  const isMobile = window.innerWidth < 768;

  if (sidebar) {
    sidebar.classList.remove("hidden", "md:flex", "pg-sidebar-hidden");
    if (isMobile) {
      sidebar.classList.add("fixed", "inset-y-0", "left-0", "z-50");
      if (backdrop) backdrop.classList.remove("hidden");
    }
  }
}

function closeSidebar() {
  const sidebar = $["pg-sidebar"];
  const backdrop = $["pg-sidebar-backdrop"];
  const isMobile = window.innerWidth < 768;

  if (sidebar) {
    if (isMobile) {
      sidebar.classList.add("pg-sidebar-hidden");
      sidebar.classList.remove("fixed", "inset-y-0", "left-0", "z-50");
    }
  }
  if (backdrop) backdrop.classList.add("hidden");
}

function toggleSidebarCollapse() {
  sidebarCollapsed = !sidebarCollapsed;
  saveSidebarCollapsed();
  applySidebarState();
}

function applySidebarState() {
  const sidebar = $["pg-sidebar"];
  const toggle = $["pg-sidebar-toggle"];
  if (!sidebar) return;

  sidebar.classList.remove("hidden", "md:flex");

  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    sidebar.classList.add("pg-sidebar-hidden");
    sidebar.classList.remove("fixed", "inset-y-0", "left-0", "z-50");
  } else {
    sidebar.classList.remove("fixed", "inset-y-0", "left-0", "z-50");
    if (sidebarCollapsed) {
      sidebar.classList.add("pg-sidebar-hidden");
    } else {
      sidebar.classList.remove("pg-sidebar-hidden");
    }
  }

  if (toggle) {
    toggle.style.display = (isMobile || sidebarCollapsed) ? "" : "none";
  }
}

// ── Settings panel ─────────────────────────────────────────

function openSettings() {
  const panel = $["pg-settings"];
  if (panel) panel.style.display = "";
  syncSettingsUI();
  void renderCachedModelsList();
}

function closeSettings() {
  const panel = $["pg-settings"];
  if (panel) panel.style.display = "none";
}

function applyModelMaxTokens(modelId: string) {
  const modelDef = MODELS.find((m) => m.id === modelId);
  const max = modelDef?.maxNewTokens ?? DEFAULT_MAX_TOKENS;

  settings.maxTokens = max;

  const slider = $["pg-max-tokens"] as HTMLInputElement;
  const valEl = $["pg-max-tokens-val"];
  if (slider) {
    slider.max = String(max);
    slider.value = String(max);
  }
  if (valEl) valEl.textContent = String(max);
}

function syncSettingsUI() {
  const prompt = $["pg-system-prompt"] as HTMLTextAreaElement;
  const temp = $["pg-temperature"] as HTMLInputElement;
  const tempVal = $["pg-temperature-val"];
  const maxTok = $["pg-max-tokens"] as HTMLInputElement;
  const maxTokVal = $["pg-max-tokens-val"];
  const topP = $["pg-top-p"] as HTMLInputElement;
  const topPVal = $["pg-top-p-val"];

  const modelMax = getActiveModelDef()?.maxNewTokens ?? DEFAULT_MAX_TOKENS;

  if (prompt) prompt.value = settings.systemPrompt;
  if (temp) temp.value = String(settings.temperature);
  if (tempVal) tempVal.textContent = String(settings.temperature);
  if (maxTok) {
    maxTok.max = String(modelMax);
    maxTok.value = String(settings.maxTokens);
  }
  if (maxTokVal) maxTokVal.textContent = String(settings.maxTokens);
  if (topP) topP.value = String(settings.topP);
  if (topPVal) topPVal.textContent = String(settings.topP);
}

// ── WebGPU status ──────────────────────────────────────────

function renderWebGPUStatus() {
  const container = $["pg-webgpu-status"];
  if (!container) return;

  const dot = container.querySelector(".pg-webgpu-dot") as HTMLElement;
  const text = container.querySelector(".pg-webgpu-text") as HTMLElement;

  container.classList.remove("border-accent/30", "border-warning/30");

  if (hasWebGPU) {
    if (dot) dot.className = "pg-webgpu-dot size-2 rounded-full bg-accent";
    if (text) text.textContent = "WebGPU available — GPU-accelerated inference";
    container.classList.add("border-accent/30");
  } else {
    if (dot) dot.className = "pg-webgpu-dot size-2 rounded-full bg-warning";
    if (text) text.textContent = "WebGPU not available — using CPU (WASM) fallback";
    container.classList.add("border-warning/30");
  }
}

// ── Helpers ────────────────────────────────────────────────

function getModelDisplayName(modelId?: string): string {
  const id = modelId ?? currentModelId;
  if (!id) return "Assistant";
  const model = MODELS.find((m) => m.id === id);
  return model?.name || id.split("/").pop() || "Assistant";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

function autoResize(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  const paddingY =
    parseFloat(getComputedStyle(textarea).paddingTop) +
    parseFloat(getComputedStyle(textarea).paddingBottom);
  const maxHeight = lineHeight * 5 + paddingY;

  if (textarea.scrollHeight <= maxHeight) {
    textarea.style.height = textarea.scrollHeight + "px";
    textarea.style.overflowY = "hidden";
  } else {
    textarea.style.height = maxHeight + "px";
    textarea.style.overflowY = "auto";
  }
}

// ── Drop overlay ───────────────────────────────────────────

type DropState = "valid" | "invalid" | "partial" | "no-model";

interface DropAnalysis {
  state: DropState;
  total: number;
  imageCount: number;
  docCount: number;
  unknownCount: number;
  rejectedCount: number;
  imageNotSupported: number;
  reason?: string;
}

const BINARY_BUNDLE_MIME = new Set([
  "application/zip",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/gzip",
  "application/x-tar",
  "application/x-bzip2",
  "application/octet-stream",
]);

const TEXT_DOC_MIME = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/x-ndjson",
  "application/sql",
]);

const TEXT_DOC_EXT = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm",
  "log", "yaml", "yml", "toml", "ini", "conf", "cfg", "ts", "tsx",
  "js", "jsx", "css", "scss", "py", "rb", "go", "rs", "java", "c",
  "cpp", "h", "hpp", "sh", "bash", "zsh", "sql", "env",
]);

function categorizeMimeType(type: string): "image" | "document" | "rejected" | "unknown" {
  if (!type) return "unknown";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "document";
  if (type.startsWith("text/")) return "document";
  if (TEXT_DOC_MIME.has(type)) return "document";
  if (type.startsWith("audio/") || type.startsWith("video/")) return "rejected";
  if (BINARY_BUNDLE_MIME.has(type)) return "rejected";
  return "unknown";
}

function isLikelyTextFile(file: File): boolean {
  if (categorizeMimeType(file.type) === "document") return true;
  const ext = file.name.toLowerCase().split(".").pop();
  return !!ext && TEXT_DOC_EXT.has(ext);
}

function dragHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = dt.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === "Files") return true;
  }
  return false;
}

function analyzeDataTransfer(dt: DataTransfer | null): DropAnalysis {
  const base: DropAnalysis = {
    state: "valid",
    total: 0,
    imageCount: 0,
    docCount: 0,
    unknownCount: 0,
    rejectedCount: 0,
    imageNotSupported: 0,
  };

  if (!modelReady) {
    return { ...base, state: "no-model" };
  }

  const items = dt?.items;
  if (!items || items.length === 0) return base;

  const caps = getActiveCapabilities();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    base.total++;
    const category = categorizeMimeType(item.type);
    if (category === "image") {
      if (caps.vision) base.imageCount++;
      else base.imageNotSupported++;
    } else if (category === "document") {
      base.docCount++;
    } else if (category === "rejected") {
      base.rejectedCount++;
    } else {
      base.unknownCount++;
    }
  }

  if (base.total === 0) return base;

  // unknown MIMEs are given the benefit of the doubt (likely .md, .txt, etc.)
  const acceptable = base.imageCount + base.docCount + base.unknownCount;

  if (acceptable === 0) {
    if (base.imageNotSupported > 0 && base.rejectedCount === 0) {
      base.state = "invalid";
      base.reason = "This model doesn't support images";
    } else if (base.rejectedCount > 0 && base.imageNotSupported === 0) {
      base.state = "invalid";
      base.reason = "Binary, audio and video files aren't supported";
    } else {
      base.state = "invalid";
      base.reason = "Unsupported file type";
    }
    return base;
  }

  if (base.imageNotSupported > 0 || base.rejectedCount > 0) {
    base.state = "partial";
    base.reason = base.imageNotSupported > 0
      ? "Some images aren't supported by this model"
      : "Some files aren't supported";
    return base;
  }

  base.state = "valid";
  return base;
}

function dropPillIcon(kind: "image" | "doc"): string {
  if (kind === "image") {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

function buildDropCountPills(a: DropAnalysis): string {
  const pills: string[] = [];
  if (a.imageCount > 0) {
    pills.push(`<span class="pg-drop-count-pill">${dropPillIcon("image")}${a.imageCount} ${a.imageCount === 1 ? "image" : "images"}</span>`);
  }
  const docs = a.docCount + a.unknownCount;
  if (docs > 0) {
    pills.push(`<span class="pg-drop-count-pill">${dropPillIcon("doc")}${docs} ${docs === 1 ? "document" : "documents"}</span>`);
  }
  return pills.join("");
}

function showDropOverlay(analysis: DropAnalysis) {
  const overlay = $["pg-drop-overlay"];
  if (!overlay) return;

  overlay.dataset.state = analysis.state;
  overlay.classList.remove("hidden");
  overlay.classList.add("flex");

  const titleEl = overlay.querySelector("[data-drop-title]") as HTMLElement | null;
  const subtitleEl = overlay.querySelector("[data-drop-subtitle]") as HTMLElement | null;
  const countsEl = overlay.querySelector("[data-drop-counts]") as HTMLElement | null;

  if (!titleEl || !subtitleEl || !countsEl) return;

  if (analysis.state === "no-model") {
    titleEl.textContent = "Load a model first";
    subtitleEl.textContent = "Pick a model from the top bar to attach files";
    countsEl.innerHTML = "";
    return;
  }

  const caps = getActiveCapabilities();
  const supportedHint = caps.vision
    ? "Images, PDFs and text files"
    : "PDFs and text files";

  if (analysis.state === "invalid") {
    titleEl.textContent = analysis.reason || "Unsupported files";
    subtitleEl.textContent = `Supported: ${supportedHint.toLowerCase()}`;
    countsEl.innerHTML = "";
    return;
  }

  if (analysis.state === "partial") {
    const supported = analysis.imageCount + analysis.docCount + analysis.unknownCount;
    titleEl.textContent = analysis.reason || "Some files won't be attached";
    subtitleEl.textContent = `${supported} of ${analysis.total} will be attached`;
    countsEl.innerHTML = buildDropCountPills(analysis);
    return;
  }

  // valid
  if (analysis.total === 0) {
    titleEl.textContent = "Drop files here";
  } else if (analysis.total === 1) {
    titleEl.textContent = "Drop to attach";
  } else {
    titleEl.textContent = `Drop ${analysis.total} files to attach`;
  }
  subtitleEl.textContent = supportedHint;
  countsEl.innerHTML = buildDropCountPills(analysis);
}

function hideDropOverlay() {
  const overlay = $["pg-drop-overlay"];
  if (!overlay) return;
  overlay.classList.add("hidden");
  overlay.classList.remove("flex");
}

// ── Attachments & Audio ────────────────────────────────────

const MAX_IMAGE_DIMENSION = 1024;

function resizeImageIfNeeded(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
        resolve(dataUrl);
        return;
      }
      const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function getActiveModelDef(): PlaygroundModel | undefined {
  return MODELS.find((m) => m.id === currentModelId);
}

function getActiveCapabilities(): ModelCapabilities {
  return getActiveModelDef()?.capabilities ?? { vision: false, audio: false, thinking: false };
}

function isMultimodalModel(): boolean {
  const caps = getActiveCapabilities();
  return (caps.vision || caps.audio) && modelHasProcessor;
}

function estimateMessageTokens(message: Message): number {
  const roleTokens = 6;
  const textTokens = Math.ceil(message.content.length / APPROX_CHARS_PER_TOKEN);
  const imageTokens = (message.images?.filter((url) => url.length > 0).length ?? 0) * IMAGE_CONTEXT_TOKENS;
  const audioTokens = message.audioUrl ? AUDIO_CONTEXT_TOKENS : 0;
  return roleTokens + textTokens + imageTokens + audioTokens;
}

function buildDraftContextMessage(): Message | null {
  const input = $["pg-input"] as HTMLTextAreaElement | undefined;
  const text = input?.value.trim() ?? "";
  const hasAttachments = pendingAttachments.length > 0;
  const hasAudio = !!pendingAudioUrl;

  if (!text && !hasAttachments && !hasAudio) return null;

  const images = pendingAttachments.filter((a) => a.type === "image").map((a) => a.dataUrl);
  const docs = pendingAttachments.filter((a) => a.type === "document");
  let content = text;

  if (docs.length > 0) {
    const docText = docs.map((d) => `[${d.name}]\n${d.textContent}`).join("\n\n");
    content = content ? `${docText}\n\n${content}` : docText;
  }

  return {
    role: "user",
    content: content || "Describe this.",
    images: images.length > 0 ? images : undefined,
    audioUrl: hasAudio ? "pending-audio" : undefined,
  };
}

function getContextBudget(): number {
  const modelContext = getActiveModelDef()?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  return Math.max(1024, modelContext - settings.maxTokens);
}

function getEstimatedContextTokens(): number {
  const conv = getActiveConversation();
  const messages: Message[] = conv?.messages ? [...conv.messages] : [];

  if ((!conv || conv.messages.length === 0) && settings.systemPrompt.trim()) {
    messages.unshift({ role: "system", content: settings.systemPrompt.trim() });
  }

  const draft = buildDraftContextMessage();
  if (draft) messages.push(draft);

  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

function hasCompactableContext(): boolean {
  const conv = getActiveConversation();
  if (!conv) return false;
  return conv.messages.filter((message) => message.role !== "system").length > CONTEXT_KEEP_RECENT_MESSAGES;
}

function updateContextIndicator() {
  const button = $["pg-context-compact"] as HTMLButtonElement | undefined;
  if (!button) return;

  const used = getEstimatedContextTokens();
  const budget = getContextBudget();
  const ratio = budget > 0 ? Math.min(1, used / budget) : 0;
  const pct = Math.round(ratio * 100);
  const state = ratio >= CONTEXT_DANGER_RATIO ? "danger" : ratio >= CONTEXT_WARN_RATIO ? "warn" : "ok";
  const canCompact = modelReady && !isGenerating && !isModelLoading && ratio >= CONTEXT_WARN_RATIO && hasCompactableContext();

  button.style.setProperty("--pg-context-progress", `${Math.round(ratio * 360)}deg`);
  button.dataset.state = state;
  button.dataset.actionable = canCompact ? "true" : "false";
  button.disabled = !canCompact;

  const label = canCompact
    ? `Compact context. Estimated context usage ${pct}% (${used.toLocaleString()} of ${budget.toLocaleString()} tokens).`
    : `Estimated context usage ${pct}% (${used.toLocaleString()} of ${budget.toLocaleString()} tokens).`;
  button.setAttribute("aria-label", label);
  button.title = canCompact ? "Compact context" : `Context ${pct}%`;
}

function summarizeMessageForContext(message: Message): string {
  const content = message.content.replace(/\s+/g, " ").trim();
  const clipped = content.length > CONTEXT_MESSAGE_SUMMARY_MAX_CHARS
    ? `${content.slice(0, CONTEXT_MESSAGE_SUMMARY_MAX_CHARS).trim()}...`
    : content;
  const attachments: string[] = [];

  const imageCount = message.images?.filter((url) => url.length > 0).length ?? 0;
  if (imageCount > 0) attachments.push(`${imageCount} image${imageCount === 1 ? "" : "s"}`);
  if (message.audioUrl) attachments.push("audio");

  const suffix = attachments.length > 0 ? ` [${attachments.join(", ")}]` : "";
  return `${message.role.toUpperCase()}: ${clipped || "(empty)"}${suffix}`;
}

function compactConversationContext() {
  const conv = getActiveConversation();
  if (!conv || isGenerating || isModelLoading) return;

  const systemMessages = conv.messages.filter((message) => message.role === "system");
  const originalSystem = systemMessages.find((message) => !message.content.startsWith(CONTEXT_SUMMARY_PREFIX));
  const existingSummaries = systemMessages
    .filter((message) => message.content.startsWith(CONTEXT_SUMMARY_PREFIX))
    .map((message) => message.content.slice(CONTEXT_SUMMARY_PREFIX.length).trim())
    .filter(Boolean);
  const visibleMessages = conv.messages.filter((message) => message.role !== "system");

  if (visibleMessages.length <= CONTEXT_KEEP_RECENT_MESSAGES) {
    showWarning("Not enough conversation history to compact yet.");
    updateContextIndicator();
    return;
  }

  const oldMessages = visibleMessages.slice(0, -CONTEXT_KEEP_RECENT_MESSAGES);
  const recentMessages = visibleMessages.slice(-CONTEXT_KEEP_RECENT_MESSAGES);
  const previousSummary = existingSummaries.length > 0
    ? `Previous summary:\n${existingSummaries.join("\n\n")}\n\n`
    : "";
  const compactedTurns = oldMessages.map(summarizeMessageForContext).join("\n\n");
  const summaryBody = `${previousSummary}Compacted turns:\n${compactedTurns}`.slice(0, CONTEXT_SUMMARY_MAX_CHARS);
  const summary: Message = {
    role: "system",
    content: `${CONTEXT_SUMMARY_PREFIX}\n${summaryBody}\n\nRecent messages are kept verbatim after this summary.`,
  };

  conv.messages = [
    ...(originalSystem ? [originalSystem] : settings.systemPrompt.trim() ? [{ role: "system" as const, content: settings.systemPrompt.trim() }] : []),
    summary,
    ...recentMessages,
  ];
  conv.updatedAt = Date.now();
  saveConversations();
  renderMessages();
  renderConversationList();
  updateContextIndicator();
  showWarning("Context compacted. Older turns were summarized and recent messages were kept.");
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  const pdfWorkerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(" "));
  }
  return pages.join("\n\n");
}

async function addFiles(files: File[]) {
  const caps = getActiveCapabilities();
  const skipped: { name: string; reason: string }[] = [];
  let imageSkipped = 0;

  for (const file of files) {
    if (file.type.startsWith("image/")) {
      if (!caps.vision) {
        imageSkipped++;
        skipped.push({ name: file.name, reason: "model doesn't support images" });
        continue;
      }
      const rawDataUrl = await readFileAsDataUrl(file);
      const dataUrl = await resizeImageIfNeeded(rawDataUrl);
      pendingAttachments.push({
        id: crypto.randomUUID(),
        type: "image",
        name: file.name,
        dataUrl,
        textContent: "",
      });
    } else if (file.type === "application/pdf") {
      try {
        const textContent = await extractPdfText(file);
        pendingAttachments.push({
          id: crypto.randomUUID(),
          type: "document",
          name: file.name,
          dataUrl: "",
          textContent,
        });
      } catch (err) {
        console.error("PDF parse error:", err);
        skipped.push({ name: file.name, reason: "could not parse PDF" });
      }
    } else if (categorizeMimeType(file.type) === "rejected") {
      skipped.push({ name: file.name, reason: "binary file" });
    } else if (!isLikelyTextFile(file) && file.type !== "") {
      skipped.push({ name: file.name, reason: "unsupported type" });
    } else {
      try {
        const textContent = await readFileAsText(file);
        const sample = textContent.slice(0, 1024);
        const nullByteCount = (sample.match(/\u0000/g) || []).length;
        if (nullByteCount > 4) {
          skipped.push({ name: file.name, reason: "binary file" });
          continue;
        }
        pendingAttachments.push({
          id: crypto.randomUUID(),
          type: "document",
          name: file.name,
          dataUrl: "",
          textContent,
        });
      } catch {
        skipped.push({ name: file.name, reason: "could not read file" });
      }
    }
  }
  renderAttachments();
  updateContextIndicator();

  if (skipped.length === 0) return;

  if (imageSkipped === skipped.length && imageSkipped > 0) {
    const visionModels = MODELS.filter((m) => m.capabilities.vision).map((m) => m.name).join(", ");
    showWarning(`${getModelDisplayName()} doesn't support images. Try: ${visionModels}`);
    return;
  }

  if (skipped.length === 1) {
    showWarning(`Couldn't attach ${skipped[0].name} — ${skipped[0].reason}`);
  } else {
    showWarning(`${skipped.length} files weren't attached (unsupported)`);
  }
}

function removeAttachment(id: string) {
  pendingAttachments = pendingAttachments.filter((a) => a.id !== id);
  renderAttachments();
  updateContextIndicator();
}

function renderAttachments() {
  const container = $["pg-attachments"];
  if (!container) return;

  if (pendingAttachments.length === 0) {
    container.classList.add("hidden");
    container.innerHTML = "";
    updateContextIndicator();
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = pendingAttachments
    .map((a) => {
      if (a.type === "image") {
        return `
          <div class="relative group">
            <img src="${a.dataUrl}" class="size-16 rounded-lg object-cover border border-edge/40" alt="${escapeHtml(a.name)}" />
            <button class="pg-remove-attachment absolute -top-1.5 -right-1.5 size-5 rounded-full bg-surface-raised border border-edge/40 flex items-center justify-center text-muted hover:text-danger transition-colors cursor-pointer opacity-0 group-hover:opacity-100" data-remove-id="${a.id}">
              <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `;
      }
      return `
        <div class="relative group flex items-center gap-2 rounded-lg border border-edge/40 bg-surface-hover/50 px-3 py-2">
          <svg class="size-4 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="text-xs text-secondary truncate max-w-[120px]">${escapeHtml(a.name)}</span>
          <button class="pg-remove-attachment shrink-0 size-5 rounded-full flex items-center justify-center text-muted hover:text-danger transition-colors cursor-pointer" data-remove-id="${a.id}">
            <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".pg-remove-attachment").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = (e.currentTarget as HTMLElement).dataset.removeId;
      if (id) removeAttachment(id);
    });
  });
}

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let pendingAudioUrl: string | null = null;
let pendingAudioBlob: Blob | null = null;

/**
 * Decode a recorded audio blob (e.g. audio/webm from MediaRecorder) into a
 * mono Float32Array resampled to the model's expected sample rate.
 *
 * This runs on the main thread because AudioContext isn't available inside
 * Web Workers, so we can't reuse Transformers.js' `read_audio` in the worker.
 */
async function decodeAudioBlob(blob: Blob, targetSampleRate: number): Promise<Float32Array> {
  const AudioContextCtor: typeof AudioContext | undefined =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available in this browser");
  }

  const ctx = new AudioContextCtor({ sampleRate: targetSampleRate });
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);

    // Replicates Transformers.js' load_audio downmix when stereo
    if (decoded.numberOfChannels >= 2) {
      const SCALING_FACTOR = Math.sqrt(2);
      const left = decoded.getChannelData(0);
      const right = decoded.getChannelData(1);
      const mono = new Float32Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        mono[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2;
      }
      return mono;
    }

    // Copy to detach from the AudioBuffer-owned memory
    return new Float32Array(decoded.getChannelData(0));
  } finally {
    if (typeof ctx.close === "function") {
      try {
        await ctx.close();
      } catch {
        // ignore – some browsers reject if already closed
      }
    }
  }
}

function startRecording() {
  if (isMultimodalModel()) {
    startMediaRecording();
  } else {
    startSpeechRecognition();
  }
}

async function startMediaRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      pendingAudioBlob = blob;
      pendingAudioUrl = URL.createObjectURL(blob);
      renderAudioPreview();
      updateContextIndicator();
      isRecording = false;
      updateMicUI();
    };

    mediaRecorder.start();
    isRecording = true;
    updateMicUI();
  } catch {
    showError("Could not access microphone. Check browser permissions.");
  }
}

function startSpeechRecognition() {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) {
    showError("Speech recognition is not supported in this browser");
    return;
  }

  const input = $["pg-input"] as HTMLTextAreaElement;
  preRecordingText = input?.value || "";

  const recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.onresult = (event: any) => {
    let finalTranscript = "";
    let interimTranscript = "";
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    if (input) {
      const sep = preRecordingText && !preRecordingText.endsWith(" ") ? " " : "";
      input.value = preRecordingText + sep + finalTranscript + interimTranscript;
      autoResize(input);
    }
  };

  recognition.onerror = () => stopRecording();
  recognition.onend = () => {
    isRecording = false;
    updateMicUI();
  };

  speechRecognition = recognition;
  recognition.start();
  isRecording = true;
  updateMicUI();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
  if (speechRecognition) {
    speechRecognition.stop();
    speechRecognition = null;
  }
  isRecording = false;
  updateMicUI();
}

function renderAudioPreview() {
  const container = $["pg-attachments"];
  if (!container || !pendingAudioUrl) return;

  container.classList.remove("hidden");

  const existing = container.querySelector("#pg-audio-preview");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "pg-audio-preview";
  el.className = "flex items-center gap-2 rounded-lg border border-edge/40 bg-surface-hover/50 px-3 py-2";
  el.innerHTML = `
    <svg class="size-4 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
    <audio src="${pendingAudioUrl}" controls class="h-8 max-w-[200px]"></audio>
    <button id="pg-remove-audio" class="shrink-0 size-5 rounded-full flex items-center justify-center text-muted hover:text-danger transition-colors cursor-pointer">
      <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  container.appendChild(el);

  el.querySelector("#pg-remove-audio")?.addEventListener("click", () => {
    if (pendingAudioUrl) URL.revokeObjectURL(pendingAudioUrl);
    pendingAudioUrl = null;
    pendingAudioBlob = null;
    el.remove();
    if (pendingAttachments.length === 0) container.classList.add("hidden");
    updateContextIndicator();
  });
}

function updateMicUI() {
  const btn = $["pg-mic-btn"];
  if (!btn) return;
  if (isRecording) {
    btn.classList.add("!text-danger", "!bg-danger/10", "animate-pulse");
    btn.classList.remove("text-muted");
  } else {
    btn.classList.remove("!text-danger", "!bg-danger/10", "animate-pulse");
    btn.classList.add("text-muted");
  }
}

// ── Main send handler ──────────────────────────────────────

interface SendPayload {
  text: string;
  attachments: Attachment[];
  audioUrl: string | null;
  audioBlob: Blob | null;
}

function snapshotInputPayload(): SendPayload | null {
  const input = $["pg-input"] as HTMLTextAreaElement | undefined;
  if (!input) return null;

  const text = input.value.trim();
  const attachments = pendingAttachments.slice();
  const audioUrl = pendingAudioUrl;
  const audioBlob = pendingAudioBlob;
  if (!text && attachments.length === 0 && !audioUrl) return null;

  input.value = "";
  autoResize(input);
  pendingAttachments = [];
  pendingAudioUrl = null;
  pendingAudioBlob = null;
  renderAttachments();
  updateContextIndicator();
  const audioPreview = document.getElementById("pg-audio-preview");
  if (audioPreview) audioPreview.remove();

  return { text, attachments, audioUrl, audioBlob };
}

async function handleSend() {
  if (!modelReady) return;

  const payload = snapshotInputPayload();
  if (!payload) return;

  if (isGenerating || messageQueue.length > 0) {
    enqueuePayload(payload);
    return;
  }

  await dispatchSend(payload);
  void drainQueue();
}

async function dispatchSend(payload: SendPayload) {
  const sendPromise = runSend(payload);
  activeSendPromise = sendPromise;
  try {
    await sendPromise;
  } finally {
    if (activeSendPromise === sendPromise) activeSendPromise = null;
  }
}

async function drainQueue() {
  if (pendingDrain) return;
  pendingDrain = true;
  try {
    while (
      messageQueue.length > 0
      && modelReady
      && !isGenerating
      && editingQueueId !== messageQueue[0].id
    ) {
      const next = messageQueue.shift()!;
      renderQueue();
      await dispatchSend(toPayload(next));
    }
  } finally {
    pendingDrain = false;
  }
}

function toPayload(item: QueuedMessage): SendPayload {
  return {
    text: item.text,
    attachments: item.attachments,
    audioUrl: item.audioUrl,
    audioBlob: item.audioBlob,
  };
}

async function runSend(payload: SendPayload) {
  let conv = getActiveConversation();
  if (!conv) {
    conv = createConversation(currentModelId);
    activeConversationId = conv.id;
    saveActiveId(conv.id);
  }

  if (conv.messages.length === 0 && settings.systemPrompt.trim()) {
    conv.messages.push({ role: "system", content: settings.systemPrompt.trim() });
  }

  const { text, attachments, audioUrl, audioBlob } = payload;
  const hasAudio = !!audioUrl;
  const images = attachments.filter((a) => a.type === "image").map((a) => a.dataUrl);
  const docs = attachments.filter((a) => a.type === "document");

  let content = text;
  if (docs.length > 0) {
    const docText = docs.map((d) => `[${d.name}]\n${d.textContent}`).join("\n\n");
    content = content ? `${docText}\n\n${content}` : docText;
  }

  const sendCaps = getActiveCapabilities();

  if (hasAudio && !sendCaps.audio) {
    content = content || "(audio message — model does not support native audio)";
  }

  const userMsg: Message = { role: "user", content: content || "Describe this." };
  if (images.length > 0 && sendCaps.vision) userMsg.images = images;
  if (hasAudio && sendCaps.audio && modelHasProcessor) userMsg.audioUrl = audioUrl!;
  conv.messages.push(userMsg);

  if (conv.messages.filter((m) => m.role === "user").length === 1) {
    const titleText = text || (hasAudio ? "Audio message" : attachments.map((a) => a.name).join(", "));
    conv.title = titleText.slice(0, 50) + (titleText.length > 50 ? "..." : "");
  }
  conv.updatedAt = Date.now();
  saveConversations();

  renderMessages();
  renderConversationList();
  addStreamingMessage();

  const result = await generateResponse(conv.messages, audioBlob);

  finalizeStreamingMessage(result);

  if (result.text.trim()) {
    const assistantMsg: Message = { role: "assistant", content: result.text };
    if (currentModelId) assistantMsg.modelId = currentModelId;
    if (result.numTokens > 0 && result.tps > 0) {
      assistantMsg.stats = { tps: result.tps, numTokens: result.numTokens, elapsedMs: result.elapsedMs };
      if (thinkingDurationSecs > 0) {
        assistantMsg.stats.thinkingSecs = Math.round(thinkingDurationSecs);
      }
    }
    conv.messages.push(assistantMsg);
    conv.updatedAt = Date.now();
    saveConversations();
  }

  renderMessages();
  renderConversationList();
}

// ── Message queue ──────────────────────────────────────────

function enqueuePayload(payload: SendPayload) {
  const item: QueuedMessage = {
    id: crypto.randomUUID(),
    text: payload.text,
    attachments: payload.attachments,
    audioUrl: payload.audioUrl,
    audioBlob: payload.audioBlob,
  };
  messageQueue.push(item);
  renderQueue();
}

function clearQueue() {
  messageQueue = [];
  resetEditingState();
  renderQueue();
}

function resetEditingState() {
  editingQueueId = null;
  editingDraft = "";
  editingSelection = null;
}

function removeFromQueue(id: string) {
  const before = messageQueue.length;
  messageQueue = messageQueue.filter((item) => item.id !== id);
  if (editingQueueId === id) resetEditingState();
  if (messageQueue.length !== before) renderQueue();
}

function forceSendQueueItem(id: string) {
  const idx = messageQueue.findIndex((item) => item.id === id);
  if (idx === -1) return;
  if (idx > 0) {
    const [item] = messageQueue.splice(idx, 1);
    messageQueue.unshift(item);
  }
  if (editingQueueId === id) resetEditingState();
  renderQueue();
  if (isGenerating) {
    abortActiveGeneration();
  } else {
    void drainQueue();
  }
}

function startEditQueueItem(id: string) {
  const item = messageQueue.find((it) => it.id === id);
  if (!item) return;
  editingQueueId = id;
  editingDraft = item.text;
  editingSelection = { start: item.text.length, end: item.text.length };
  renderQueue();
}

function cancelEditQueueItem() {
  if (editingQueueId === null) return;
  resetEditingState();
  renderQueue();
  void drainQueue();
}

function saveEditQueueItem(id: string, rawText: string) {
  const item = messageQueue.find((i) => i.id === id);
  if (!item) {
    resetEditingState();
    renderQueue();
    return;
  }
  const newText = rawText.trim();
  if (!newText && item.attachments.length === 0 && !item.audioUrl) {
    removeFromQueue(id);
    void drainQueue();
    return;
  }
  item.text = newText;
  resetEditingState();
  renderQueue();
  void drainQueue();
}

function captureEditingSelection() {
  const container = $["pg-queue"];
  if (!container || !editingQueueId) return;
  const ta = container.querySelector<HTMLTextAreaElement>(
    `textarea[data-queue-edit-id="${editingQueueId}"]`,
  );
  if (!ta) return;
  editingDraft = ta.value;
  editingSelection = { start: ta.selectionStart, end: ta.selectionEnd };
}

function renderQueue() {
  const container = $["pg-queue"];
  if (!container) return;

  captureEditingSelection();

  if (messageQueue.length === 0) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  if (editingQueueId && !messageQueue.some((it) => it.id === editingQueueId)) {
    resetEditingState();
  }

  container.classList.remove("hidden");
  container.innerHTML = messageQueue.map((item, idx) => renderQueueItem(item, idx)).join("");

  if (editingQueueId) {
    const ta = container.querySelector<HTMLTextAreaElement>(
      `textarea[data-queue-edit-id="${editingQueueId}"]`,
    );
    if (ta) {
      ta.focus();
      const start = editingSelection?.start ?? ta.value.length;
      const end = editingSelection?.end ?? ta.value.length;
      ta.setSelectionRange(start, end);
      autoResize(ta);
    }
  }
}

function renderQueueItem(item: QueuedMessage, idx: number): string {
  const isEditing = editingQueueId === item.id;
  const number = idx + 1;
  const attachmentCount = item.attachments.length;
  const hasAudio = !!item.audioUrl;

  const metaBits: string[] = [];
  if (attachmentCount > 0) metaBits.push(`${attachmentCount} file${attachmentCount === 1 ? "" : "s"}`);
  if (hasAudio) metaBits.push("audio");
  const metaHtml = metaBits.length > 0
    ? `<span class="shrink-0 font-mono text-[10px] text-muted/60">· ${metaBits.join(" · ")}</span>`
    : "";

  const editValue = isEditing ? editingDraft : item.text;
  const body = isEditing
    ? `
      <textarea
        data-queue-edit-id="${item.id}"
        class="flex-1 min-w-0 resize-none rounded-lg border border-edge/60 bg-surface-card px-2 py-1.5 text-xs text-primary outline-none focus:border-accent/40 leading-relaxed"
        rows="2"
        placeholder="Empty message"
      >${escapeHtml(editValue)}</textarea>
    `
    : `
      <div class="flex-1 min-w-0 flex items-baseline gap-1.5">
        <p class="min-w-0 flex-1 text-xs text-secondary whitespace-pre-wrap break-words line-clamp-3 leading-relaxed">${escapeHtml(item.text || "(empty message)")}</p>
        ${metaHtml}
      </div>
    `;

  const btn = (
    action: string,
    label: string,
    title: string,
    icon: string,
    cls = "text-muted hover:bg-surface-hover hover:text-primary",
  ) => `
    <button
      type="button"
      data-queue-action="${action}"
      data-queue-id="${item.id}"
      class="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${cls}"
      aria-label="${label}"
      title="${title}"
    >${icon}</button>
  `;

  const icons = {
    force: '<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>',
    edit: '<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    trash: '<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    check: '<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    close: '<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  const actions = isEditing
    ? `
      ${btn("save", "Save edit", "Save (Enter)", icons.check, "text-accent hover:bg-accent/10")}
      ${btn("cancel-edit", "Cancel edit", "Cancel (Esc)", icons.close)}
    `
    : `
      ${btn("force", "Send now", "Send now — cancels current", icons.force, "text-accent/70 hover:bg-accent/10 hover:text-accent")}
      ${btn("edit", "Edit message", "Edit", icons.edit)}
      ${btn("delete", "Remove from queue", "Remove", icons.trash, "text-muted hover:bg-danger/10 hover:text-danger")}
    `;

  return `
    <div class="pg-queue-item flex items-start gap-2 rounded-xl border border-edge/40 bg-surface-card/40 px-3 py-2" data-queue-id="${item.id}">
      <span class="mt-1 flex size-4 shrink-0 items-center justify-center rounded-md bg-accent/10 font-mono text-[9px] text-accent">${number}</span>
      ${body}
      <div class="flex shrink-0 items-center gap-0.5">${actions}</div>
    </div>
  `;
}

// ── Event binding ──────────────────────────────────────────

function bindEvents() {
  // Send message
  $["pg-send"]?.addEventListener("click", handleSend);

  // Input: Enter to send, Shift+Enter for newline, auto-resize
  ($["pg-input"] as HTMLTextAreaElement)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  ($["pg-input"] as HTMLTextAreaElement)?.addEventListener("input", () => {
    autoResize($["pg-input"] as HTMLTextAreaElement);
    updateContextIndicator();
  });

  $["pg-context-compact"]?.addEventListener("click", compactConversationContext);

  // Message queue (delegated)
  $["pg-queue"]?.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLElement>("[data-queue-action]");
    if (!btn) return;
    const action = btn.dataset.queueAction;
    const id = btn.dataset.queueId;
    if (!action || !id) return;

    if (action === "force") {
      forceSendQueueItem(id);
    } else if (action === "edit") {
      startEditQueueItem(id);
    } else if (action === "delete") {
      removeFromQueue(id);
    } else if (action === "cancel-edit") {
      cancelEditQueueItem();
    } else if (action === "save") {
      const ta = $["pg-queue"]?.querySelector<HTMLTextAreaElement>(`textarea[data-queue-edit-id="${id}"]`);
      if (ta) saveEditQueueItem(id, ta.value);
    }
  });

  $["pg-queue"]?.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "TEXTAREA") return;
    const ta = target as HTMLTextAreaElement;
    const id = ta.dataset.queueEditId;
    if (!id) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEditQueueItem(id, ta.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditQueueItem();
    }
  });

  $["pg-queue"]?.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "TEXTAREA") return;
    const ta = target as HTMLTextAreaElement;
    if (ta.dataset.queueEditId === editingQueueId) {
      editingDraft = ta.value;
      editingSelection = { start: ta.selectionStart, end: ta.selectionEnd };
    }
    autoResize(ta);
  });

  // Stop generation
  $["pg-stop"]?.addEventListener("click", () => {
    abortWorkerWork();
  });

  // Model picker
  $["pg-model-trigger"]?.addEventListener("click", () => {
    toggleModelDropdown();
  });

  $["pg-model-dropdown"]?.addEventListener("click", async (e) => {
    const btn = (e.target as Element).closest<HTMLElement>("[data-model-id]");
    if (!btn) return;
    const modelId = btn.dataset.modelId;
    if (!modelId) return;
    toggleModelDropdown(true);
    const success = await loadModel(modelId);
    if (success) {
      renderModelSelect();
      updateModelInfo();
    }
  });

  // New chat
  $["pg-new-chat"]?.addEventListener("click", () => {
    abortActiveGeneration();
    clearQueue();
    const conv = createConversation(currentModelId);
    activeConversationId = conv.id;
    saveActiveId(conv.id);
    renderMessages();
    renderConversationList();
    updateInputState();
    closeSidebar();
    ($["pg-input"] as HTMLTextAreaElement)?.focus();
  });

  // Conversation list (event delegation)
  $["pg-conversation-list"]?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    const refreshBtn = target.closest("[data-refresh-id]") as HTMLElement;
    if (refreshBtn) {
      e.stopPropagation();
      const refreshId = refreshBtn.dataset.refreshId;
      if (refreshId) void regenerateConversationTitle(refreshId);
      return;
    }

    const menuBtn = target.closest("[data-menu-id]") as HTMLElement;
    if (menuBtn) {
      e.stopPropagation();
      const rect = menuBtn.getBoundingClientRect();
      showContextMenu(menuBtn.dataset.menuId!, rect.right, rect.top);
      return;
    }

    const folderMenuBtn = target.closest("[data-folder-menu-id]") as HTMLElement;
    if (folderMenuBtn) {
      e.stopPropagation();
      const rect = folderMenuBtn.getBoundingClientRect();
      showFolderContextMenu(folderMenuBtn.dataset.folderMenuId!, rect.right, rect.top);
      return;
    }

    const toggleFolder = target.closest("[data-toggle-folder]") as HTMLElement;
    if (toggleFolder && !target.closest("[data-folder-menu-id]")) {
      e.stopPropagation();
      toggleFolderCollapse(toggleFolder.dataset.toggleFolder!);
      return;
    }

    const convBtn = target.closest("[data-conv-id]") as HTMLElement;
    if (convBtn) {
      switchConversation(convBtn.dataset.convId!);
      closeSidebar();
    }
  });

  // Context menu actions
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const ctxItem = target.closest("[data-ctx-action]") as HTMLElement;

    if (ctxItem) {
      e.stopPropagation();
      const action = ctxItem.dataset.ctxAction;
      const id = ctxItem.dataset.ctxId;
      const folderId = ctxItem.dataset.ctxFolder;

      if (id) {
        switch (action) {
          case "pin": case "unpin": togglePin(id); break;
          case "archive": case "unarchive": archiveConversation(id); break;
          case "rename": renameConversation(id); break;
          case "regen-title": void regenerateConversationTitle(id); break;
          case "delete": deleteConversation(id); break;
          case "move-to-folder": if (folderId) moveToFolder(id, folderId); break;
          case "remove-from-folder": moveToFolder(id, null); break;
          case "new-folder": {
            const f = createFolder();
            if (f) moveToFolder(id, f.id);
            break;
          }
          case "rename-folder": renameFolder(id); break;
          case "delete-folder": deleteFolder(id); break;
        }
      }
      hideContextMenu();
      return;
    }

    const ctxMenu = $["pg-context-menu"];
    if (ctxMenu && !ctxMenu.contains(target)) hideContextMenu();

    const picker = $["pg-model-picker"];
    if (picker && !picker.contains(target)) toggleModelDropdown(true);
  });

  // Search
  $["pg-search-trigger"]?.addEventListener("click", () => {
    const bar = $["pg-search-bar"];
    const trigger = $["pg-search-trigger"];
    if (bar && trigger) {
      bar.classList.remove("hidden");
      trigger.classList.add("hidden");
      ($["pg-search-input"] as HTMLInputElement)?.focus();
    }
  });

  $["pg-search-close"]?.addEventListener("click", () => {
    const bar = $["pg-search-bar"];
    const trigger = $["pg-search-trigger"];
    const input = $["pg-search-input"] as HTMLInputElement;
    if (bar && trigger) {
      bar.classList.add("hidden");
      trigger.classList.remove("hidden");
      if (input) input.value = "";
      searchQuery = "";
      renderConversationList();
    }
  });

  ($["pg-search-input"] as HTMLInputElement)?.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    renderConversationList();
  });

  // Archived toggle
  $["pg-archived-toggle"]?.addEventListener("click", () => {
    showArchived = !showArchived;
    renderConversationList();
  });

  // Clear all
  $["pg-clear-all"]?.addEventListener("click", () => {
    if (conversations.length === 0) return;
    if (!confirm("Delete all conversations? This cannot be undone.")) return;
    abortActiveGeneration();
    clearQueue();
    conversations = [];
    folders = [];
    activeConversationId = null;
    saveConversations();
    saveFolders();
    saveActiveId(null);
    renderMessages();
    renderConversationList();
  });

  // Sidebar toggle
  $["pg-sidebar-toggle"]?.addEventListener("click", () => {
    const sidebar = $["pg-sidebar"];
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      openSidebar();
    } else {
      sidebarCollapsed = false;
      saveSidebarCollapsed();
      applySidebarState();
    }
  });
  $["pg-sidebar-close"]?.addEventListener("click", closeSidebar);
  $["pg-sidebar-collapse"]?.addEventListener("click", () => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      closeSidebar();
    } else {
      toggleSidebarCollapse();
    }
  });
  $["pg-sidebar-backdrop"]?.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideContextMenu();
      toggleModelDropdown(true);
    }
  });

  // Settings
  $["pg-settings-btn"]?.addEventListener("click", openSettings);
  $["pg-settings-close"]?.addEventListener("click", closeSettings);
  $["pg-settings-backdrop"]?.addEventListener("click", closeSettings);

  // Settings inputs
  ($["pg-system-prompt"] as HTMLTextAreaElement)?.addEventListener("input", (e) => {
    settings.systemPrompt = (e.target as HTMLTextAreaElement).value;
    saveSettings();
  });

  ($["pg-temperature"] as HTMLInputElement)?.addEventListener("input", (e) => {
    settings.temperature = parseFloat((e.target as HTMLInputElement).value);
    const val = $["pg-temperature-val"];
    if (val) val.textContent = String(settings.temperature);
    saveSettings();
  });

  ($["pg-max-tokens"] as HTMLInputElement)?.addEventListener("input", (e) => {
    settings.maxTokens = parseInt((e.target as HTMLInputElement).value);
    const val = $["pg-max-tokens-val"];
    if (val) val.textContent = String(settings.maxTokens);
    saveSettings();
    updateContextIndicator();
  });

  ($["pg-top-p"] as HTMLInputElement)?.addEventListener("input", (e) => {
    settings.topP = parseFloat((e.target as HTMLInputElement).value);
    const val = $["pg-top-p-val"];
    if (val) val.textContent = String(settings.topP);
    saveSettings();
  });

  // Delete all cached models
  $["pg-delete-all-cache"]?.addEventListener("click", async () => {
    if (!confirm("Delete cached data for all models?")) return;
    await deleteAllCachedModels();
    await checkCachedModels();
    renderModelSelect();
    await renderCachedModelsList();
  });

  // Attach button
  $["pg-attach-btn"]?.addEventListener("click", () => {
    ($["pg-file-input"] as HTMLInputElement)?.click();
  });

  ($["pg-file-input"] as HTMLInputElement)?.addEventListener("change", (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) addFiles(Array.from(files));
    (e.target as HTMLInputElement).value = "";
  });

  // Mic button
  $["pg-mic-btn"]?.addEventListener("click", () => {
    if (isRecording) stopRecording();
    else startRecording();
  });

  // Drag & drop
  let dragCounter = 0;
  let dragAnalysis: DropAnalysis | null = null;

  document.addEventListener("dragenter", (e) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dragAnalysis = analyzeDataTransfer(e.dataTransfer);
      showDropOverlay(dragAnalysis);
    }
  });

  document.addEventListener("dragover", (e) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      const state = dragAnalysis?.state;
      e.dataTransfer.dropEffect = state === "invalid" || state === "no-model" ? "none" : "copy";
    }
  });

  document.addEventListener("dragleave", (e) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dragAnalysis = null;
      hideDropOverlay();
    }
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const wasInvalid = dragAnalysis?.state === "invalid";
    const wasNoModel = dragAnalysis?.state === "no-model";
    dragCounter = 0;
    dragAnalysis = null;
    hideDropOverlay();

    if (!dragHasFiles(e.dataTransfer)) return;

    if (wasNoModel || !modelReady) {
      showWarning("Load a model first to attach files");
      return;
    }

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    if (wasInvalid) {
      const caps = getActiveCapabilities();
      const hint = caps.vision ? "Try images, PDFs or text files" : "Try PDFs or text files";
      showWarning(`These files aren't supported. ${hint}.`);
      return;
    }

    addFiles(Array.from(files));
  });

  // Paste files (images)
  ($["pg-input"] as HTMLTextAreaElement)?.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0 && modelReady) addFiles(files);
  });
}

// ── Init ───────────────────────────────────────────────────

export async function initPlayground() {
  initDom();

  // Load persisted data
  settings = loadSettings();
  conversations = loadConversations();
  activeConversationId = loadActiveId();
  folders = loadFolders();
  sidebarCollapsed = loadSidebarCollapsed();
  showArchived = false;
  searchQuery = "";

  // Validate active conversation exists
  if (activeConversationId && !conversations.find((c) => c.id === activeConversationId)) {
    const visible = conversations.filter((c) => !c.archived);
    activeConversationId = visible[0]?.id || null;
    saveActiveId(activeConversationId);
  }

  // Detect WebGPU
  hasWebGPU = await detectWebGPU();

  // Check cached models before first render
  await checkCachedModels();

  // Initial render
  applySidebarState();
  renderModelSelect();
  renderConversationList();
  renderMessages();
  renderWebGPUStatus();
  updateInputState();

  // Bind events
  bindEvents();

  // Auto-load the saved model when it's still in MODELS. If the user picked a
  // model that has since been removed (or never picked one), fall back to the
  // first model in MODELS so something useful is loaded on entry.
  let modelToLoad = "";
  if (settings.lastModelId && MODELS.some((m) => m.id === settings.lastModelId)) {
    modelToLoad = settings.lastModelId;
  } else {
    modelToLoad = MODELS[0]?.id ?? "";
    if (settings.lastModelId && settings.lastModelId !== modelToLoad) {
      settings.lastModelId = "";
      saveSettings();
    }
  }

  if (modelToLoad) {
    const success = await loadModel(modelToLoad);
    if (success) {
      renderModelSelect();
      updateModelInfo();
    }
  }
}
