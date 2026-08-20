import { basename } from "node:path";
import { RUNAI_DEFAULT_MAX_TOKENS, RUNAI_DEFAULT_MODEL, RUNAI_DEFAULT_PORT } from "./config";
import { modelPathFromId } from "./model-store";
import { isModelFilePresent, listInstalledModels } from "./db";
import {
  EmbeddingModelIncompatibleError,
  generateEmbedding,
  getInferenceQueueSnapshot,
  queueInference as withQueue,
  runLlamaChatOnce,
  runLlamaChatStream,
  runLlamaOnce,
  runLlamaStream,
  unloadModel,
} from "./llamacpp";
import { closeDb } from "./db";
import {
  createChatResponse,
  createCompletionResponse,
  createCompletionSSEChunk,
  createSSEChunk,
  createEmbeddingResponse,
  extractInferenceParams,
  normalizeCompletionPrompt,
  type ChatCompletionRequest,
  type CompletionRequest,
  type EmbeddingRequest,
} from "./openai";
import { sendInferenceTelemetry } from "./telemetry";

interface ServeOptions {
  model?: string;
  port?: number;
}

function resolveModelPath(input?: string): string {
  const model = input || RUNAI_DEFAULT_MODEL;
  if (!model) throw new Error("Model is required. Use --model <path|id> or RUNAI_MODEL.");
  if (model.includes("/") || model.endsWith(".gguf")) return model;
  return modelPathFromId(model);
}

interface ResolvedApiModel {
  id: string;
  path: string;
}

function stripGguf(value: string): string {
  return value.replace(/\.gguf$/i, "");
}

async function resolveApiModel(requestedModel: string | undefined, fallbackPath: string): Promise<ResolvedApiModel> {
  if (!requestedModel) {
    return {
      id: stripGguf(basename(fallbackPath)),
      path: fallbackPath,
    };
  }

  const token = requestedModel.trim();
  if (!token) {
    return {
      id: stripGguf(basename(fallbackPath)),
      path: fallbackPath,
    };
  }

  if (token.includes("/") || token.endsWith(".gguf")) {
    if (!isModelFilePresent(token)) {
      throw new Error(`Model file not found: ${token}`);
    }
    return {
      id: stripGguf(basename(token)),
      path: token,
    };
  }

  const normalized = token.toLowerCase();
  const installed = listInstalledModels();
  const availableInstalled = installed.filter((item) => isModelFilePresent(item.path));
  if (normalized === "auto") {
    const first = availableInstalled[0];
    if (first) {
      return { id: first.id, path: first.path };
    }
    if (isModelFilePresent(fallbackPath)) {
      return {
        id: stripGguf(basename(fallbackPath)),
        path: fallbackPath,
      };
    }
    throw new Error("No installed models found for \"auto\". Use /v1/models to inspect available models.");
  }

  const match = installed.find((item) => {
    const idMatch = item.id.toLowerCase() === normalized;
    const nameMatch = item.name.toLowerCase() === normalized;
    const fileName = basename(item.path).toLowerCase();
    const fileNameNoExt = stripGguf(fileName);
    return idMatch || nameMatch || fileName === normalized || fileNameNoExt === normalized;
  });
  if (match && isModelFilePresent(match.path)) {
    return { id: match.id, path: match.path };
  }

  const derivedPath = modelPathFromId(token);
  if (isModelFilePresent(derivedPath)) {
    return {
      id: stripGguf(basename(derivedPath)),
      path: derivedPath,
    };
  }

  throw new Error(`Unknown model "${token}". Use /v1/models to list installed models.`);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const sharedEncoder = new TextEncoder();

function sse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...CORS_HEADERS,
    },
  });
}

function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function startServer(options: ServeOptions): void {
  const modelPath = resolveModelPath(options.model);
  const modelLabel = stripGguf(basename(modelPath));
  const port = options.port || RUNAI_DEFAULT_PORT;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    routes: {
      "/v1/chat/completions": {
        POST: async (req) => {
          let body: ChatCompletionRequest;
          try {
            body = await req.json() as ChatCompletionRequest;
          } catch {
            return json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, 400);
          }

          if (!body.messages?.length) {
            return json({ error: { message: "messages is required", type: "invalid_request_error" } }, 400);
          }

          const params = extractInferenceParams(body, RUNAI_DEFAULT_MAX_TOKENS);
          let activeModel: ResolvedApiModel;
          try {
            activeModel = await resolveApiModel(body.model, modelPath);
          } catch (error) {
            return json(
              { error: { message: error instanceof Error ? error.message : "Invalid model", type: "invalid_request_error" } },
              400,
            );
          }

          if (!body.stream) {
            const startedAt = performance.now();
            try {
              const result = await withQueue(() => runLlamaChatOnce({
                modelPath: activeModel.path,
                messages: body.messages,
                params,
              }));
              sendInferenceTelemetry({
                model: activeModel.id,
                stream: false,
                success: true,
                latencyMs: performance.now() - startedAt,
                outputText: result.text,
                temperature: params.temperature,
                maxTokens: params.maxTokens,
              });
              return json(createChatResponse(activeModel.id, result.text, result.promptTokens, result.completionTokens));
            } catch (error) {
              sendInferenceTelemetry({
                model: activeModel.id,
                stream: false,
                success: false,
                latencyMs: performance.now() - startedAt,
                outputText: "",
                temperature: params.temperature,
                maxTokens: params.maxTokens,
              });
              const message = error instanceof Error ? error.message : "Inference failed";
              const status = message.includes("overloaded") ? 429 : 500;
              return json({ error: { message, type: "server_error" } }, status);
            }
          }

          if (!getInferenceQueueSnapshot().canAccept) {
            return json({
              error: {
                message: "Server is overloaded. Try again later.",
                type: "server_error",
              },
            }, 429);
          }
          const stream = new ReadableStream({
            start: async (controller) => {
              const startedAt = performance.now();
              const chunks: string[] = [];
              const completionId = `chatcmpl_${crypto.randomUUID().replaceAll("-", "")}`;
              const created = Math.floor(Date.now() / 1000);
              try {
                await withQueue(() => runLlamaChatStream(
                  { modelPath: activeModel.path, messages: body.messages, params },
                  (chunk) => {
                    chunks.push(chunk);
                    const payload = createSSEChunk(activeModel.id, chunk, false, completionId, created);
                    controller.enqueue(sharedEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                  },
                ));
                const aggregated = chunks.join("");
                sendInferenceTelemetry({
                  model: activeModel.id,
                  stream: true,
                  success: true,
                  latencyMs: performance.now() - startedAt,
                  outputText: aggregated,
                  temperature: params.temperature,
                  maxTokens: params.maxTokens,
                });
                controller.enqueue(
                  sharedEncoder.encode(
                    `data: ${JSON.stringify(createSSEChunk(activeModel.id, "", true, completionId, created))}\n\n`,
                  ),
                );
                controller.enqueue(sharedEncoder.encode("data: [DONE]\n\n"));
                controller.close();
              } catch (error) {
                sendInferenceTelemetry({
                  model: activeModel.id,
                  stream: true,
                  success: false,
                  latencyMs: performance.now() - startedAt,
                  outputText: chunks.join(""),
                  temperature: params.temperature,
                  maxTokens: params.maxTokens,
                });
                const payload = {
                  error: {
                    message: error instanceof Error ? error.message : "stream failed",
                    type: "server_error",
                  },
                };
                controller.enqueue(sharedEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                controller.close();
              }
            },
          });

          return sse(stream);
        },
        OPTIONS: optionsResponse,
      },
      "/v1/completions": {
        POST: async (req) => {
          let body: CompletionRequest;
          try {
            body = await req.json() as CompletionRequest;
          } catch {
            return json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, 400);
          }

          const prompt = normalizeCompletionPrompt(body.prompt);
          if (!prompt.trim()) {
            return json({ error: { message: "prompt is required", type: "invalid_request_error" } }, 400);
          }

          const params = extractInferenceParams(body, RUNAI_DEFAULT_MAX_TOKENS);
          let activeModel: ResolvedApiModel;
          try {
            activeModel = await resolveApiModel(body.model, modelPath);
          } catch (error) {
            return json(
              { error: { message: error instanceof Error ? error.message : "Invalid model", type: "invalid_request_error" } },
              400,
            );
          }

          if (!body.stream) {
            const startedAt = performance.now();
            try {
              const result = await withQueue(() => runLlamaOnce({
                modelPath: activeModel.path,
                prompt,
                temperature: params.temperature,
                maxTokens: params.maxTokens,
                topP: params.topP,
                topK: params.topK,
                seed: params.seed,
                stop: params.stop,
                repeatPenalty: params.repeatPenalty,
                frequencyPenalty: params.frequencyPenalty,
                presencePenalty: params.presencePenalty,
              }));
              sendInferenceTelemetry({
                model: activeModel.id,
                stream: false,
                success: true,
                latencyMs: performance.now() - startedAt,
                outputText: result.text,
                temperature: params.temperature,
                maxTokens: params.maxTokens,
              });
              return json(createCompletionResponse(activeModel.id, result.text, result.promptTokens, result.completionTokens));
            } catch (error) {
              sendInferenceTelemetry({
                model: activeModel.id,
                stream: false,
                success: false,
                latencyMs: performance.now() - startedAt,
                outputText: "",
                temperature: params.temperature,
                maxTokens: params.maxTokens,
              });
              const message = error instanceof Error ? error.message : "Inference failed";
              const status = message.includes("overloaded") ? 429 : 500;
              return json({ error: { message, type: "server_error" } }, status);
            }
          }

          if (!getInferenceQueueSnapshot().canAccept) {
            return json({
              error: {
                message: "Server is overloaded. Try again later.",
                type: "server_error",
              },
            }, 429);
          }
          const stream = new ReadableStream({
            start: async (controller) => {
              const startedAt = performance.now();
              const chunks: string[] = [];
              const completionId = `cmpl_${crypto.randomUUID().replaceAll("-", "")}`;
              const created = Math.floor(Date.now() / 1000);
              try {
                await withQueue(() => runLlamaStream(
                  {
                    modelPath: activeModel.path,
                    prompt,
                    temperature: params.temperature,
                    maxTokens: params.maxTokens,
                    topP: params.topP,
                    topK: params.topK,
                    seed: params.seed,
                    stop: params.stop,
                    repeatPenalty: params.repeatPenalty,
                    frequencyPenalty: params.frequencyPenalty,
                    presencePenalty: params.presencePenalty,
                  },
                  (chunk) => {
                    chunks.push(chunk);
                    const payload = createCompletionSSEChunk(
                      activeModel.id,
                      chunk,
                      false,
                      completionId,
                      created,
                    );
                    controller.enqueue(sharedEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                  },
                ));
                const aggregated = chunks.join("");
                sendInferenceTelemetry({
                  model: activeModel.id,
                  stream: true,
                  success: true,
                  latencyMs: performance.now() - startedAt,
                  outputText: aggregated,
                  temperature: params.temperature,
                  maxTokens: params.maxTokens,
                });
                controller.enqueue(
                  sharedEncoder.encode(
                    `data: ${JSON.stringify(
                      createCompletionSSEChunk(activeModel.id, "", true, completionId, created),
                    )}\n\n`,
                  ),
                );
                controller.enqueue(sharedEncoder.encode("data: [DONE]\n\n"));
                controller.close();
              } catch (error) {
                sendInferenceTelemetry({
                  model: activeModel.id,
                  stream: true,
                  success: false,
                  latencyMs: performance.now() - startedAt,
                  outputText: chunks.join(""),
                  temperature: params.temperature,
                  maxTokens: params.maxTokens,
                });
                const payload = {
                  error: {
                    message: error instanceof Error ? error.message : "stream failed",
                    type: "server_error",
                  },
                };
                controller.enqueue(sharedEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                controller.close();
              }
            },
          });

          return sse(stream);
        },
        OPTIONS: optionsResponse,
      },
      "/v1/embeddings": {
        POST: async (req) => {
          let body: EmbeddingRequest;
          try {
            body = await req.json() as EmbeddingRequest;
          } catch {
            return json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, 400);
          }

          const inputs = typeof body.input === "string" ? [body.input] : body.input;
          if (!inputs || inputs.length === 0) {
            return json({ error: { message: "input is required", type: "invalid_request_error" } }, 400);
          }
          if (body.encoding_format === "base64") {
            return json(
              {
                error: {
                  message: "encoding_format \"base64\" is not supported; use \"float\".",
                  type: "invalid_request_error",
                },
              },
              400,
            );
          }

          let activeModel: ResolvedApiModel;
          try {
            activeModel = await resolveApiModel(body.model, modelPath);
          } catch (error) {
            return json(
              { error: { message: error instanceof Error ? error.message : "Invalid model", type: "invalid_request_error" } },
              400,
            );
          }

          try {
            const { results, totalTokens } = await withQueue(async () => {
              const results: Array<{ embedding: number[]; index: number }> = [];
              let totalTokens = 0;
              for (let i = 0; i < inputs.length; i++) {
                const inputText = inputs[i]!;
                const { embedding, tokenCount } = await generateEmbedding(activeModel.path, inputText);
                results.push({ embedding, index: i });
                totalTokens += tokenCount;
              }
              return { results, totalTokens };
            });
            return json(createEmbeddingResponse(activeModel.id, results, totalTokens));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Embedding failed";
            if (message.includes("overloaded")) {
              return json({ error: { message, type: "server_error" } }, 429);
            }
            if (error instanceof EmbeddingModelIncompatibleError) {
              return json({ error: { message, type: "invalid_request_error" } }, 400);
            }
            return json({ error: { message, type: "server_error" } }, 500);
          }
        },
        OPTIONS: optionsResponse,
      },
      "/v1/models": {
        GET: async () => {
          const now = Math.floor(Date.now() / 1000);
          const installed = listInstalledModels();
          const available = installed.filter((item) => isModelFilePresent(item.path));
          const data = available.map((item) => ({
            id: item.id,
            object: "model",
            created: now,
            owned_by: "runai",
          }));
          if (data.length === 0 && isModelFilePresent(modelPath)) {
            data.push({
              id: modelLabel,
              object: "model",
              created: now,
              owned_by: "runai",
            });
          }
          if (data.length > 0) {
            data.unshift({
              id: "auto",
              object: "model",
              created: now,
              owned_by: "runai",
            });
          }
          return json({
            object: "list",
            data,
          });
        },
        OPTIONS: optionsResponse,
      },
      "/health": {
        GET: () => {
          const queue = getInferenceQueueSnapshot();
          return json({
            ok: true,
            service: "runai",
            pid: process.pid,
            model: modelLabel,
            active_requests: queue.activeRequests,
            queued_requests: queue.queuedRequests,
          });
        },
        OPTIONS: optionsResponse,
      },
    },
    fetch() {
      return json({ error: { message: "Not found", type: "invalid_request_error" } }, 404);
    },
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.stop();
    await unloadModel();
    closeDb();
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  console.log(`runai API listening at http://localhost:${port}`);
  console.log(`OpenAI-compatible endpoints:`);
  console.log(`  POST http://localhost:${port}/v1/chat/completions`);
  console.log(`  POST http://localhost:${port}/v1/completions`);
  console.log(`  POST http://localhost:${port}/v1/embeddings`);
  console.log(`  GET  http://localhost:${port}/v1/models`);
  console.log(`Model: ${modelPath}`);
}
