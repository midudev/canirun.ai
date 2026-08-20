import type { ChatMessage } from "./types";

export type { ChatMessage };

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  seed?: number;
  stop?: string | string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  repeat_penalty?: number;
}

export interface CompletionRequest {
  model?: string;
  prompt: string | string[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  seed?: number;
  stop?: string | string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  repeat_penalty?: number;
}

export interface EmbeddingRequest {
  model?: string;
  input: string | string[];
  encoding_format?: "float" | "base64";
}

export function buildPrompt(messages: ChatMessage[]): string {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n") + "\nASSISTANT:";
}

function normalizeStop(stop: string | string[] | undefined): string[] {
  if (!stop) return [];
  if (typeof stop === "string") return [stop];
  return stop;
}

export function extractInferenceParams(
  body: ChatCompletionRequest | CompletionRequest,
  defaultMaxTokens = 2048,
) {
  return {
    temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
    maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : defaultMaxTokens,
    topP: body.top_p,
    topK: body.top_k,
    seed: body.seed,
    stop: normalizeStop(body.stop),
    repeatPenalty: body.repeat_penalty,
    frequencyPenalty: body.frequency_penalty,
    presencePenalty: body.presence_penalty,
  };
}

export function createChatResponse(model: string, content: string, promptTokens = 0, completionTokens = 0) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `chatcmpl_${crypto.randomUUID().replaceAll("-", "")}`,
    object: "chat.completion",
    created: now,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export function createSSEChunk(
  model: string,
  delta: string,
  done = false,
  id = `chatcmpl_${crypto.randomUUID().replaceAll("-", "")}`,
  created = Math.floor(Date.now() / 1000),
) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: done ? {} : { content: delta },
        finish_reason: done ? "stop" : null,
      },
    ],
  };
}

export function normalizeCompletionPrompt(prompt: CompletionRequest["prompt"]): string {
  if (typeof prompt === "string") return prompt;
  if (Array.isArray(prompt)) return prompt.join("\n");
  return "";
}

export function createCompletionResponse(model: string, text: string, promptTokens = 0, completionTokens = 0) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `cmpl_${crypto.randomUUID().replaceAll("-", "")}`,
    object: "text_completion",
    created: now,
    model,
    choices: [
      {
        text,
        index: 0,
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export function createCompletionSSEChunk(
  model: string,
  text: string,
  done = false,
  id = `cmpl_${crypto.randomUUID().replaceAll("-", "")}`,
  created = Math.floor(Date.now() / 1000),
) {
  return {
    id,
    object: "text_completion",
    created,
    model,
    choices: [
      {
        text,
        index: 0,
        finish_reason: done ? "stop" : null,
      },
    ],
  };
}

export function createEmbeddingResponse(model: string, embeddings: Array<{ embedding: number[]; index: number }>, totalTokens: number) {
  return {
    object: "list",
    data: embeddings.map((item) => ({
      object: "embedding",
      embedding: item.embedding,
      index: item.index,
    })),
    model,
    usage: {
      prompt_tokens: totalTokens,
      total_tokens: totalTokens,
    },
  };
}
