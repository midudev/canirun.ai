import { existsSync } from "node:fs";
import {
  RUNAI_CONTEXT_SIZE,
  RUNAI_KEEP_ALIVE_MS,
  RUNAI_MAX_QUEUE,
} from "./config";
import { FifoInferenceQueue } from "./inference-queue";
import type { ChatMessage, InferenceParams } from "./types";

type LlamaModule = typeof import("node-llama-cpp");
let _llamaModule: LlamaModule | null = null;

async function requireLlamaModule(): Promise<LlamaModule> {
  if (!_llamaModule) {
    _llamaModule = await import("node-llama-cpp");
  }
  return _llamaModule;
}

export interface LlamaRunOptions {
  modelPath: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  topK?: number;
  seed?: number;
  stop?: string[];
  repeatPenalty?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface LlamaChatOptions {
  modelPath: string;
  messages: ChatMessage[];
  params: InferenceParams;
}

export interface LlamaStreamChunk {
  text: string;
  segmentType: "main" | "thought" | "comment";
  segmentStart?: boolean;
  segmentEnd?: boolean;
}

export type LlamaChatHistoryItem =
  | { type: "system"; text: string }
  | { type: "user"; text: string }
  | { type: "model"; response: string[] };

type LlamaInstance = Awaited<ReturnType<LlamaModule["getLlama"]>>;
type LlamaModel = Awaited<ReturnType<LlamaInstance["loadModel"]>>;
type LlamaContext = Awaited<ReturnType<LlamaModel["createContext"]>>;
type LlamaEmbeddingContext = Awaited<ReturnType<LlamaModel["createEmbeddingContext"]>>;
type LlamaChatSessionInstance = InstanceType<LlamaModule["LlamaChatSession"]>;

let cachedModelPath: string | null = null;
let cachedModel: LlamaModel | null = null;
let cachedLlama: LlamaInstance | null = null;
let cachedInferenceContext: LlamaContext | null = null;
let cachedInferenceSession: LlamaChatSessionInstance | null = null;
let cachedEmbeddingContext: LlamaEmbeddingContext | null = null;
let keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
let inferenceRunning = false;
const modelArchitectureCache = new Map<string, string>();
const UNSUPPORTED_MAIN_ARCHITECTURES = new Set<string>([]);
const GPU_OOM_HINT = "GPU memory exhausted while running the model. Try a smaller quant/model, lower max tokens, or close GPU-heavy apps and retry.";
const inferenceQueue = new FifoInferenceQueue(RUNAI_MAX_QUEUE);

export function queueInference<T>(fn: () => Promise<T>): Promise<T> {
  return inferenceQueue.run(async () => {
    inferenceRunning = true;
    if (keepAliveTimer) {
      clearTimeout(keepAliveTimer);
      keepAliveTimer = null;
    }
    try {
      return await fn();
    } finally {
      inferenceRunning = false;
      if (cachedModel) resetKeepAliveTimer();
    }
  });
}

export function getInferenceQueueSnapshot(): {
  activeRequests: number;
  queuedRequests: number;
  canAccept: boolean;
} {
  return {
    activeRequests: inferenceQueue.activeRequests,
    queuedRequests: inferenceQueue.queuedRequests,
    canAccept: inferenceQueue.canAccept,
  };
}

type DisposableResource = {
  dispose?: () => void | Promise<void>;
  release?: () => void | Promise<void>;
  free?: () => void | Promise<void>;
};

async function disposeResource(resource: unknown): Promise<void> {
  if (!resource) return;
  const candidate = resource as DisposableResource;
  try {
    if (typeof candidate.dispose === "function") {
      await candidate.dispose();
      return;
    }
    if (typeof candidate.release === "function") {
      await candidate.release();
      return;
    }
    if (typeof candidate.free === "function") {
      await candidate.free();
    }
  } catch {
    // Cleanup should never mask inference failures.
  }
}

function resetKeepAliveTimer(): void {
  if (keepAliveTimer) clearTimeout(keepAliveTimer);
  if (RUNAI_KEEP_ALIVE_MS <= 0 || inferenceRunning) return;
  keepAliveTimer = setTimeout(async () => {
    await unloadModel();
  }, RUNAI_KEEP_ALIVE_MS);
}

export async function unloadModel(): Promise<void> {
  if (keepAliveTimer) {
    clearTimeout(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (cachedInferenceContext) {
    cachedInferenceSession = null;
    await disposeResource(cachedInferenceContext);
    cachedInferenceContext = null;
  }
  if (cachedEmbeddingContext) {
    await disposeResource(cachedEmbeddingContext);
    cachedEmbeddingContext = null;
  }
  if (cachedModel) {
    await disposeResource(cachedModel);
    cachedModel = null;
    cachedModelPath = null;
  }
}

export function isModelLoaded(): boolean {
  return cachedModel !== null;
}

export function getLoadedModelPath(): string | null {
  return cachedModelPath;
}

export async function warmupModel(modelPath: string, onProgress?: (progress: number) => void): Promise<void> {
  await getModel(modelPath, onProgress);
}

export function getModelMemoryUsage(): { rss: number; heapUsed: number } | null {
  if (!cachedModel) return null;
  const mem = process.memoryUsage();
  return { rss: mem.rss, heapUsed: mem.heapUsed };
}

function shouldResetModelFromError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("outofmemory")
    || message.includes("insufficient memory")
    || message.includes("backend is in error state")
    || message.includes("failed to decode, ret = -3");
}

async function handleInferenceError(error: unknown): Promise<never> {
  if (shouldResetModelFromError(error)) {
    await unloadModel();
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`${GPU_OOM_HINT} (${details})`);
  }
  throw error;
}

export async function getModelArchitecture(modelPath: string): Promise<string | null> {
  const cached = modelArchitectureCache.get(modelPath);
  if (cached) return cached;

  try {
    const { readGgufFileInfo } = await requireLlamaModule();
    const info = await readGgufFileInfo(modelPath, { readTensorInfo: false, logWarnings: false });
    const architecture = String(info.metadata.general.architecture || "").toLowerCase();
    if (!architecture) return null;
    modelArchitectureCache.set(modelPath, architecture);
    return architecture;
  } catch {
    return null;
  }
}

export async function getModelInfo(modelPath: string): Promise<{
  architecture: string | null;
  contextLength: number | null;
  name: string | null;
  quantization: string | null;
  fileType: number | null;
}> {
  try {
    const { readGgufFileInfo } = await requireLlamaModule();
    const info = await readGgufFileInfo(modelPath, { readTensorInfo: false, logWarnings: false });
    const meta = info.metadata as Record<string, unknown>;
    const general = (meta.general || {}) as Record<string, unknown>;
    return {
      architecture: general.architecture ? String(general.architecture) : null,
      contextLength: typeof general.context_length === "number" ? general.context_length : null,
      name: general.name ? String(general.name) : null,
      quantization: general.quantization_version ? String(general.quantization_version) : null,
      fileType: typeof general.file_type === "number" ? general.file_type : null,
    };
  } catch {
    return { architecture: null, contextLength: null, name: null, quantization: null, fileType: null };
  }
}

async function assertMainChatModel(modelPath: string): Promise<void> {
  const architecture = await getModelArchitecture(modelPath);
  if (architecture === "clip") {
    throw new Error(
      "This GGUF is CLIP/mmproj (multimodal projector), not a chat model. Delete it and reinstall with `runai recommend`.",
    );
  }
  if (architecture && UNSUPPORTED_MAIN_ARCHITECTURES.has(architecture)) {
    throw new Error(
      `This GGUF uses '${architecture}' architecture, which is not supported by the current node-llama-cpp runtime. `
      + "Use a different model (for example Qwen 3.5 GGUF via `runai recommend`) or update the runtime when support is available.",
    );
  }
}

async function ensureLlama() {
  if (!cachedLlama) {
    const { getLlama, LlamaLogLevel } = await requireLlamaModule();
    cachedLlama = await getLlama({ logLevel: LlamaLogLevel.error });
  }
  return cachedLlama;
}

async function getModel(
  modelPath: string,
  onProgress?: (progress: number) => void,
  purpose: "chat" | "embedding" = "chat",
) {
  if (purpose === "chat") {
    await assertMainChatModel(modelPath);
  }
  if (cachedModel && cachedModelPath === modelPath) {
    resetKeepAliveTimer();
    return cachedModel;
  }
  if (!existsSync(modelPath)) {
    throw new Error(`Model not found at ${modelPath}`);
  }

  if (cachedModel && cachedModelPath !== modelPath) {
    await unloadModel();
  }

  const llama = await ensureLlama();
  try {
    cachedModel = await llama.loadModel({ modelPath, onLoadProgress: onProgress });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("clip cannot be used as main model")) {
      throw new Error(
        "This GGUF appears to be a multimodal projector (mmproj/CLIP), not a chat model. Reinstall the model with `runai recommend` and try again.",
      );
    }
    if (message.toLowerCase().includes("unknown model architecture")) {
      const architecture = await getModelArchitecture(modelPath);
      const architectureHint = architecture ? ` (${architecture})` : "";
      throw new Error(
        `Failed to load model: unsupported GGUF architecture${architectureHint} in current node-llama-cpp runtime. `
        + "Try a different model with `runai recommend` (Qwen 3.5 works) or upgrade your local runtime/dependencies.",
      );
    }
    throw error;
  }
  cachedModelPath = modelPath;
  resetKeepAliveTimer();
  return cachedModel;
}

async function getInferenceRuntime(modelPath: string): Promise<{
  model: LlamaModel;
  session: LlamaChatSessionInstance;
}> {
  const model = await getModel(modelPath);
  if (!cachedInferenceContext) {
    cachedInferenceContext = await model.createContext({ contextSize: RUNAI_CONTEXT_SIZE });
  }
  if (!cachedInferenceSession) {
    const { LlamaChatSession } = await requireLlamaModule();
    cachedInferenceSession = new LlamaChatSession({
      contextSequence: cachedInferenceContext.getSequence(),
    });
  }
  return { model, session: cachedInferenceSession };
}

async function getEmbeddingContext(modelPath: string): Promise<{
  model: LlamaModel;
  context: LlamaEmbeddingContext;
}> {
  const model = await getModel(modelPath, undefined, "embedding");
  if (!cachedEmbeddingContext) {
    cachedEmbeddingContext = await model.createEmbeddingContext();
  }
  return { model, context: cachedEmbeddingContext };
}

export function buildPromptOptions(params: InferenceParams): Record<string, unknown> {
  const opts: Record<string, unknown> = {};
  if (params.temperature !== undefined) opts.temperature = params.temperature;
  if (params.maxTokens !== undefined) opts.maxTokens = params.maxTokens;
  if (params.topP !== undefined) opts.topP = params.topP;
  if (params.topK !== undefined) opts.topK = params.topK;
  if (params.seed !== undefined) opts.seed = params.seed;
  if (
    params.repeatPenalty !== undefined
    || params.frequencyPenalty !== undefined
    || params.presencePenalty !== undefined
  ) {
    opts.repeatPenalty = {
      ...(params.repeatPenalty !== undefined ? { penalty: params.repeatPenalty } : {}),
      ...(params.frequencyPenalty !== undefined ? { frequencyPenalty: params.frequencyPenalty } : {}),
      ...(params.presencePenalty !== undefined ? { presencePenalty: params.presencePenalty } : {}),
    };
  }
  if (params.stop && params.stop.length > 0) opts.customStopTriggers = params.stop;
  return opts;
}

export function toLlamaChatHistory(messages: ChatMessage[]): {
  history: LlamaChatHistoryItem[];
  prompt: string;
} {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") {
    throw new Error("Last message must be from user");
  }

  const history = messages.slice(0, -1).map<LlamaChatHistoryItem>((message) => {
    if (message.role === "assistant") {
      return { type: "model", response: [message.content] };
    }
    return { type: message.role, text: message.content };
  });

  return { history, prompt: lastMessage.content };
}

type ChatSessionWithHistory = {
  setChatHistory(history: LlamaChatHistoryItem[]): void;
};

function restoreChatHistory(
  session: ChatSessionWithHistory,
  messages: ChatMessage[],
): string {
  const { history, prompt } = toLlamaChatHistory(messages);
  session.setChatHistory(history);
  return prompt;
}

export async function tokenize(modelPath: string, text: string): Promise<number[]> {
  const model = await getModel(modelPath);
  return Array.from(model.tokenize(text));
}

export async function countTokens(modelPath: string, text: string): Promise<number> {
  const model = await getModel(modelPath);
  const tokens = model.tokenize(text);
  return tokens.length;
}

export async function generateEmbedding(modelPath: string, input: string): Promise<{ embedding: number[]; tokenCount: number }> {
  try {
    const { model, context } = await getEmbeddingContext(modelPath);
    const result = await context.getEmbeddingFor(input);
    const tokenCount = model.tokenize(input).length;
    return { embedding: Array.from(result.vector), tokenCount };
  } catch (error) {
    throw normalizeEmbeddingError(error);
  }
}

export class EmbeddingModelIncompatibleError extends Error {
  constructor(message = "The selected model does not support embeddings. Choose an embedding-compatible GGUF model.") {
    super(message);
    this.name = "EmbeddingModelIncompatibleError";
  }
}

function normalizeEmbeddingError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("embedding") && (
      normalized.includes("not support")
      || normalized.includes("not enabled")
      || normalized.includes("unsupported")
      || normalized.includes("cannot")
    )
  ) {
    return new EmbeddingModelIncompatibleError();
  }
  return error instanceof Error ? error : new Error(message);
}

export async function runLlamaOnce(options: LlamaRunOptions): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const { model, session } = await getInferenceRuntime(options.modelPath);
  try {
    session.setChatHistory([]);
    const promptOpts = buildPromptOptions({
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      topK: options.topK,
      seed: options.seed,
      stop: options.stop,
      repeatPenalty: options.repeatPenalty,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
    });
    const text = await session.prompt(options.prompt, promptOpts as never);
    const promptTokens = model.tokenize(options.prompt).length;
    const completionTokens = model.tokenize(text).length;
    return { text: text.trim(), promptTokens, completionTokens };
  } catch (error) {
    return await handleInferenceError(error);
  }
}

export async function runLlamaChatOnce(options: LlamaChatOptions): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const { model, session } = await getInferenceRuntime(options.modelPath);
  try {
    const prompt = restoreChatHistory(session, options.messages);

    const promptOpts = buildPromptOptions(options.params);
    const text = await session.prompt(prompt, promptOpts as never);

    let promptTokenCount = 0;
    for (const msg of options.messages) {
      promptTokenCount += model.tokenize(msg.content).length;
    }
    const completionTokens = model.tokenize(text).length;

    return { text: text.trim(), promptTokens: promptTokenCount, completionTokens };
  } catch (error) {
    return await handleInferenceError(error);
  }
}

export async function runLlamaStream(
  options: LlamaRunOptions,
  onChunk: (chunk: string) => void,
): Promise<{ promptTokens: number; completionTokens: number }> {
  const { model, session } = await getInferenceRuntime(options.modelPath);
  try {
    session.setChatHistory([]);
    const promptOpts = buildPromptOptions({
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      topK: options.topK,
      seed: options.seed,
      stop: options.stop,
      repeatPenalty: options.repeatPenalty,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
    });

    let hasChunks = false;
    let fullText = "";
    const text = await session.prompt(options.prompt, {
      ...promptOpts,
      onTextChunk: (chunk: string) => {
        hasChunks = true;
        fullText += chunk;
        onChunk(chunk);
      },
    } as never);

    if (!hasChunks && text) {
      fullText = text;
      onChunk(text);
    }

    const promptTokens = model.tokenize(options.prompt).length;
    const completionTokens = model.tokenize(fullText || text).length;
    return { promptTokens, completionTokens };
  } catch (error) {
    await handleInferenceError(error);
    return { promptTokens: 0, completionTokens: 0 };
  }
}

export async function runLlamaChatStream(
  options: LlamaChatOptions,
  onChunk: (chunk: string) => void,
): Promise<{ promptTokens: number; completionTokens: number }> {
  const { model, session } = await getInferenceRuntime(options.modelPath);
  try {
    const prompt = restoreChatHistory(session, options.messages);

    const promptOpts = buildPromptOptions(options.params);
    let hasChunks = false;
    let fullText = "";
    const text = await session.prompt(prompt, {
      ...promptOpts,
      onTextChunk: (chunk: string) => {
        hasChunks = true;
        fullText += chunk;
        onChunk(chunk);
      },
    } as never);

    if (!hasChunks && text) {
      fullText = text;
      onChunk(text);
    }

    let promptTokenCount = 0;
    for (const msg of options.messages) {
      promptTokenCount += model.tokenize(msg.content).length;
    }
    const completionTokens = model.tokenize(fullText || text).length;
    return { promptTokens: promptTokenCount, completionTokens };
  } catch (error) {
    await handleInferenceError(error);
    return { promptTokens: 0, completionTokens: 0 };
  }
}

export async function runLlamaStreamWithSegments(
  options: LlamaRunOptions,
  onChunk: (chunk: LlamaStreamChunk) => void,
): Promise<void> {
  const { session } = await getInferenceRuntime(options.modelPath);
  try {
    session.setChatHistory([]);
    const promptOpts = buildPromptOptions({
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      topK: options.topK,
      seed: options.seed,
      stop: options.stop,
      repeatPenalty: options.repeatPenalty,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
    });

    let hasChunks = false;
    const text = await session.prompt(options.prompt, {
      ...promptOpts,
      onResponseChunk: (chunk: { type: string; text: string; segmentType?: string; segmentStartTime?: unknown; segmentEndTime?: unknown }) => {
        hasChunks = true;
        if (chunk.type === "segment" && chunk.segmentType === "thought") {
          onChunk({
            text: chunk.text,
            segmentType: "thought",
            segmentStart: Boolean(chunk.segmentStartTime),
            segmentEnd: Boolean(chunk.segmentEndTime),
          });
          return;
        }
        onChunk({
          text: chunk.text,
          segmentType: "main",
        });
      },
    } as never);

    if (!hasChunks && text) {
      onChunk({
        text,
        segmentType: "main",
      });
    }
  } catch (error) {
    await handleInferenceError(error);
  }
}

export async function runLlamaChatStreamWithSegments(
  options: LlamaChatOptions,
  onChunk: (chunk: LlamaStreamChunk) => void,
): Promise<{ promptTokens: number; completionTokens: number }> {
  const { model, session } = await getInferenceRuntime(options.modelPath);
  try {
    const prompt = restoreChatHistory(session, options.messages);

    const promptOpts = buildPromptOptions(options.params);
    let hasChunks = false;
    let fullText = "";
    const text = await session.prompt(prompt, {
      ...promptOpts,
      onResponseChunk: (chunk: { type: string; text: string; segmentType?: string; segmentStartTime?: unknown; segmentEndTime?: unknown }) => {
        hasChunks = true;
        fullText += chunk.text;
        if (chunk.type === "segment" && chunk.segmentType === "thought") {
          onChunk({
            text: chunk.text,
            segmentType: "thought",
            segmentStart: Boolean(chunk.segmentStartTime),
            segmentEnd: Boolean(chunk.segmentEndTime),
          });
          return;
        }
        onChunk({
          text: chunk.text,
          segmentType: "main",
        });
      },
    } as never);

    if (!hasChunks && text) {
      fullText = text;
      onChunk({
        text,
        segmentType: "main",
      });
    }

    let promptTokenCount = 0;
    for (const msg of options.messages) {
      promptTokenCount += model.tokenize(msg.content).length;
    }
    const completionTokens = model.tokenize(fullText || text).length;
    return { promptTokens: promptTokenCount, completionTokens };
  } catch (error) {
    await handleInferenceError(error);
    return { promptTokens: 0, completionTokens: 0 };
  }
}

// ── Persistent chat session ──────────────────────────────────

export interface PersistentChatSession {
  prompt(
    text: string,
    params: InferenceParams,
    onChunk: (chunk: LlamaStreamChunk) => void,
  ): Promise<{ completionTokens: number; text: string }>;
  dispose(): Promise<void>;
}

export async function createPersistentChatSession(
  modelPath: string,
  systemPrompt?: string,
): Promise<PersistentChatSession> {
  const { LlamaChatSession } = await requireLlamaModule();
  const model = await getModel(modelPath);
  const context = await model.createContext({ contextSize: RUNAI_CONTEXT_SIZE });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt,
  });

  return {
    async prompt(promptText, params, onChunk) {
      const promptOpts = buildPromptOptions(params);
      let hasChunks = false;
      let fullText = "";

      try {
        const responseText = await session.prompt(promptText, {
          ...promptOpts,
          onResponseChunk: (chunk: {
            type: string | undefined;
            text: string;
            segmentType?: string;
            segmentStartTime?: unknown;
            segmentEndTime?: unknown;
          }) => {
            hasChunks = true;
            fullText += chunk.text;
            if (chunk.type === "segment" && chunk.segmentType === "thought") {
              onChunk({
                text: chunk.text,
                segmentType: "thought",
                segmentStart: Boolean(chunk.segmentStartTime),
                segmentEnd: Boolean(chunk.segmentEndTime),
              });
              return;
            }
            onChunk({ text: chunk.text, segmentType: "main" });
          },
        } as never);

        if (!hasChunks && responseText) {
          fullText = responseText;
          onChunk({ text: responseText, segmentType: "main" });
        }

        const generatedText = (responseText || fullText).trim();
        const completionTokens = model.tokenize(fullText || responseText || "").length;
        return { completionTokens, text: generatedText };
      } catch (error) {
        return await handleInferenceError(error);
      }
    },
    async dispose() {
      await disposeResource(context);
    },
  };
}
