import * as Comlink from "comlink";
import type {
  GenerateRequest,
  GenerationResult,
  LoadProgress,
  LoadResult,
  PlaygroundDevice,
  WorkerAPI,
  WorkerMessage,
} from "./playground-worker-types";

type Transformers = typeof import("@huggingface/transformers");

let transformersPromise: Promise<Transformers> | null = null;
let currentModel: any = null;
let currentTokenizer: any = null;
let currentProcessor: any = null;
let currentModelId = "";
let abortRequested = false;

function getTransformers(): Promise<Transformers> {
  transformersPromise ??= import("@huggingface/transformers").then((mod) => {
    mod.env.useWasmCache = true;
    return mod;
  });
  return transformersPromise;
}

function getLoadCapabilities(modelId: string): { vision: boolean; audio: boolean } {
  const id = modelId.toLowerCase();
  return {
    vision: id.includes("gemma-4") || id.includes("qwen3.5"),
    audio: id.includes("gemma-4"),
  };
}

function getModelClass(transformers: Transformers, modelId: string, isVisionModel: boolean) {
  if (!isVisionModel) return transformers.AutoModelForCausalLM;

  const anyTransformers = transformers as any;
  const id = modelId.toLowerCase();

  if (id.includes("qwen3.5")) {
    return anyTransformers.Qwen3_5ForConditionalGeneration
      ?? anyTransformers.AutoModelForImageTextToText
      ?? transformers.AutoModelForCausalLM;
  }

  if (id.includes("gemma-4")) {
    return anyTransformers.Gemma4ForConditionalGeneration
      ?? anyTransformers.AutoModelForImageTextToText
      ?? transformers.AutoModelForCausalLM;
  }

  return anyTransformers.AutoModelForImageTextToText ?? transformers.AutoModelForCausalLM;
}

async function disposeCurrentModel() {
  if (currentModel) {
    try {
      await currentModel.dispose?.();
    } catch {
      // Best-effort GPU/WASM resource cleanup.
    }
  }
  currentModel = null;
  currentTokenizer = null;
  currentProcessor = null;
  currentModelId = "";
}

function throwIfAborted() {
  if (abortRequested) throw new Error("Cancelled");
}

async function load(
  modelId: string,
  device: PlaygroundDevice,
  onProgress: (progress: LoadProgress) => void,
): Promise<LoadResult> {
  if (currentModelId === modelId && currentModel && currentTokenizer) {
    return { ok: true, hasProcessor: !!currentProcessor };
  }

  abortRequested = false;

  try {
    const transformers = await getTransformers();
    const { AutoTokenizer } = transformers;
    const anyTransformers = transformers as any;
    const capabilities = getLoadCapabilities(modelId);
    const isVisionModel = capabilities.vision || capabilities.audio;

    await disposeCurrentModel();
    throwIfAborted();

    const progressCallback = (progress: any) => {
      if (!abortRequested) onProgress(progress);
    };

    let tokenizer: any;
    if (isVisionModel && anyTransformers.AutoProcessor) {
      onProgress({ status: "message", message: "Loading processor..." });
      currentProcessor = await anyTransformers.AutoProcessor.from_pretrained(modelId, {
        progress_callback: progressCallback,
      });
      tokenizer = currentProcessor.tokenizer ?? currentProcessor;
    } else {
      currentProcessor = null;
      onProgress({ status: "message", message: "Loading tokenizer..." });
      tokenizer = await AutoTokenizer.from_pretrained(modelId, {
        progress_callback: progressCallback,
      });
    }

    throwIfAborted();

    onProgress({ status: "message", message: "Loading model (this may take a moment)..." });
    const ModelClass = getModelClass(transformers, modelId, isVisionModel);
    const dtype = device === "webgpu" ? "q4f16" : "q4";
    const model = await ModelClass.from_pretrained(modelId, {
      dtype,
      device,
      progress_callback: progressCallback,
    } as any);

    if (abortRequested) {
      try {
        await model.dispose?.();
      } catch {
        // ignore
      }
      throw new Error("Cancelled");
    }

    currentModel = model;
    currentTokenizer = tokenizer;
    currentModelId = modelId;

    return { ok: true, hasProcessor: !!currentProcessor };
  } catch (err: any) {
    if (err?.message === "Cancelled") {
      await disposeCurrentModel();
      return { ok: false, error: "Cancelled", cancelled: true };
    }

    console.error("Worker model load error:", err);
    return { ok: false, error: err?.message || "Unknown error" };
  }
}

async function readImages(transformers: Transformers, messages: WorkerMessage[]) {
  const images: any[] = [];
  const { RawImage } = transformers;

  for (const message of messages) {
    for (const url of message.images ?? []) {
      if (!url) continue;
      const blob = await fetch(url).then((res) => res.blob());
      images.push(await RawImage.read(blob));
    }
  }

  return images;
}

async function generate(
  request: GenerateRequest,
  onToken: (event: { text: string; numTokens: number; tps: number }) => void,
): Promise<GenerationResult> {
  if (!currentModel || !currentTokenizer) {
    return { text: "", numTokens: 0, tps: 0, elapsedMs: 0, error: "No model loaded" };
  }

  abortRequested = false;

  const transformers = await getTransformers();
  const { TextStreamer } = transformers;

  let fullText = "";
  let startTime: number | null = null;
  let numTokens = 0;
  let tps = 0;

  try {
    const token_callback_function = () => {
      if (startTime === null) startTime = performance.now();
      numTokens++;
      if (numTokens > 1 && startTime !== null) {
        tps = ((numTokens - 1) / (performance.now() - startTime)) * 1000;
      }
    };

    const isThinkingModel = request.thinkingFormat != null;
    const callback_function = (token: string) => {
      if (abortRequested) throw new Error("__ABORT__");

      if (isThinkingModel) {
        const cleaned = token.replace(/<\|[^>]+\|>/g, "");
        if (!cleaned) return;
        fullText += cleaned;
      } else {
        fullText += token;
      }

      onToken({ text: fullText, numTokens, tps });
    };

    const streamer = new TextStreamer(currentTokenizer, {
      skip_prompt: true,
      skip_special_tokens: !isThinkingModel,
      callback_function,
      token_callback_function,
    });

    const lastUserIndex = request.messages.map((m) => m.role).lastIndexOf("user");
    const hasImages = request.messages.some((m) => m.images?.some((url) => url.length > 0));
    const hasAudio = !!request.audio?.data?.length;
    const isMultimodal = ((hasImages && request.capabilities.vision) || (hasAudio && request.capabilities.audio)) && !!currentProcessor;

    let genConfig: any;

    if (isMultimodal) {
      const inputMessages = request.messages.map((message, index) => {
        const validImages = message.images?.filter((url) => url.length > 0);
        const hasImg = validImages && validImages.length > 0;
        const hasAud = index === lastUserIndex && hasAudio;

        if (hasImg || hasAud) {
          const content: Array<{ type: string; text?: string }> = [];
          if (hasImg) validImages.forEach(() => content.push({ type: "image" }));
          if (hasAud) content.push({ type: "audio" });
          content.push({ type: "text", text: message.content || "Describe this." });
          return { role: message.role, content };
        }

        return { role: message.role, content: message.content };
      });

      const allImages = await readImages(transformers, request.messages);

      // Audio is decoded in the main thread (AudioContext isn't available in Web Workers)
      // and arrives here as a Float32Array already resampled to the processor's expected rate.
      const audioData = hasAudio ? request.audio!.data : null;

      const templateOpts: Record<string, any> = {
        add_generation_prompt: true,
        tokenize: false,
      };
      if (request.thinkingFormat === "qwen") {
        templateOpts.enable_thinking = true;
      }

      const text = currentTokenizer.apply_chat_template(inputMessages, templateOpts);
      const inputs = await currentProcessor(
        text,
        allImages.length > 0 ? allImages : null,
        audioData,
        { add_special_tokens: false },
      );

      genConfig = {
        ...inputs,
        max_new_tokens: request.settings.maxTokens,
        do_sample: request.settings.temperature > 0,
        temperature: Math.max(request.settings.temperature, 0.01),
        top_p: request.settings.topP,
        streamer,
      };
    } else {
      const inputMessages = request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const templateOpts: Record<string, any> = {
        add_generation_prompt: true,
        return_dict: true,
      };
      if (request.thinkingFormat === "qwen") {
        templateOpts.enable_thinking = true;
      }

      const inputs = currentTokenizer.apply_chat_template(inputMessages, templateOpts);
      genConfig = {
        ...inputs,
        max_new_tokens: request.settings.maxTokens,
        do_sample: request.settings.temperature > 0,
        temperature: Math.max(request.settings.temperature, 0.01),
        top_p: request.settings.topP,
        streamer,
      };
    }

    await currentModel.generate(genConfig);

    const elapsedMs = startTime !== null ? performance.now() - startTime : 0;
    return { text: fullText, numTokens, tps, elapsedMs };
  } catch (err: any) {
    if (err?.message === "__ABORT__") {
      const elapsedMs = startTime !== null ? performance.now() - startTime : 0;
      return { text: fullText, numTokens, tps, elapsedMs };
    }

    console.error("Worker generation error:", err);
    return { text: "", numTokens: 0, tps: 0, elapsedMs: 0, error: err?.message || "Unknown error" };
  }
}

function abort() {
  abortRequested = true;
}

async function dispose() {
  abortRequested = true;
  await disposeCurrentModel();
}

function getAudioSampleRate(): number | null {
  const rate = currentProcessor?.feature_extractor?.config?.sampling_rate;
  return typeof rate === "number" ? rate : null;
}

async function hasCachedModel(modelId: string): Promise<boolean> {
  try {
    const cache = await caches.open("transformers-cache");
    const keys = await cache.keys();
    const urls = keys.map((request) => request.url);
    return urls.some((url) => url.includes(encodeURIComponent(modelId)) || url.includes(modelId));
  } catch {
    return false;
  }
}

const api: WorkerAPI = {
  load,
  generate,
  abort,
  dispose,
  hasCachedModel,
  getAudioSampleRate,
};

Comlink.expose(api);
