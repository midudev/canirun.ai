import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

const llama = vi.hoisted(() => {
  const loaded: Array<{ disposed: boolean }> = [];
  const sessions: Array<{ history: unknown[]; restored: unknown[] | null }> = [];
  const replyDelay = { ms: 0 };

  function fakeModel() {
    const contexts: Array<{ disposed: boolean }> = [];
    const model = {
      disposed: false,
      async dispose() {
        model.disposed = true;
        for (const context of contexts) context.disposed = true;
      },
      async createContext() {
        const context = {
          disposed: false,
          getSequence: () => ({}),
          async dispose() {
            context.disposed = true;
          },
        };
        contexts.push(context);
        return context;
      },
      tokenize: (text: string) => text.split(" "),
    };
    loaded.push(model);
    return model;
  }

  class LlamaChatSession {
    private history: unknown[] = [];
    private readonly record: { history: unknown[]; restored: unknown[] | null };
    private readonly sequenceOwner: { disposed: boolean };

    constructor() {
      this.record = { history: this.history, restored: null };
      this.sequenceOwner = loaded[loaded.length - 1];
      sessions.push(this.record);
    }

    async prompt(text: string) {
      if (this.sequenceOwner.disposed) throw new Error("Object is disposed");
      if (replyDelay.ms) await new Promise((resolve) => setTimeout(resolve, replyDelay.ms));
      if (this.sequenceOwner.disposed) throw new Error("Object is disposed");
      const reply = `reply to ${text}`;
      this.history.push({ type: "user", text }, { type: "model", response: [reply] });
      return reply;
    }

    getChatHistory() {
      return structuredClone(this.history);
    }

    setChatHistory(history: unknown[]) {
      this.history = structuredClone(history);
      this.record.history = this.history;
      this.record.restored = structuredClone(history);
    }
  }

  return { loaded, sessions, replyDelay, fakeModel, LlamaChatSession };
});

vi.mock("node-llama-cpp", () => ({
  LlamaLogLevel: { error: "error" },
  LlamaChatSession: llama.LlamaChatSession,
  getLlama: async () => ({ loadModel: async () => llama.fakeModel() }),
  readGgufFileInfo: async () => ({ metadata: { general: { architecture: "qwen35" } } }),
}));

vi.mock("../src/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/config")>()),
  RUNAI_KEEP_ALIVE_MS: 50,
}));

const { createPersistentChatSession, isModelLoaded, unloadModel } = await import("../src/llamacpp");

const modelPath = join(mkdtempSync(join(tmpdir(), "runai-chat-")), "model.gguf");
writeFileSync(modelPath, "");
const params = { maxTokens: 32 } as never;

describe("persistent chat session", () => {
  test("reloads the model and keeps the conversation after the keep-alive unloads it", async () => {
    const chat = await createPersistentChatSession(modelPath);
    expect((await chat.prompt("first", params, () => {})).text).toBe("reply to first");

    await unloadModel(); // what the keep-alive timer does once the chat sits idle
    expect(isModelLoaded()).toBe(false);

    expect((await chat.prompt("second", params, () => {})).text).toBe("reply to second");
    expect(isModelLoaded()).toBe(true);
    const reloaded = llama.sessions[llama.sessions.length - 1];
    expect(reloaded.restored).toEqual([
      { type: "user", text: "first" },
      { type: "model", response: ["reply to first"] },
    ]);

    await chat.dispose();
    await unloadModel();
  });

  test("the keep-alive timer doesn't unload the model in the middle of a reply", async () => {
    const chat = await createPersistentChatSession(modelPath);
    llama.replyDelay.ms = 150; // longer than the 50 ms keep-alive
    try {
      expect((await chat.prompt("slow", params, () => {})).text).toBe("reply to slow");
    } finally {
      llama.replyDelay.ms = 0;
    }

    await chat.dispose();
    await unloadModel();
  });
});
