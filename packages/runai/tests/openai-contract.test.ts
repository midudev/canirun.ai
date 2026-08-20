import { describe, expect, test } from "vitest";
import {
  buildPrompt,
  createChatResponse,
  createCompletionResponse,
  createCompletionSSEChunk,
  createSSEChunk,
  extractInferenceParams,
  normalizeCompletionPrompt,
} from "../src/openai";

describe("openai compatibility contract", () => {
  test("buildPrompt concatenates roles and content", () => {
    const prompt = buildPrompt([
      { role: "system", content: "Be concise" },
      { role: "user", content: "Hola" },
    ]);
    expect(prompt).toContain("SYSTEM: Be concise");
    expect(prompt).toContain("USER: Hola");
    expect(prompt).toContain("ASSISTANT:");
  });

  test("createChatResponse follows chat.completion shape", () => {
    const response = createChatResponse("local-model", "Hola!");
    expect(response.object).toBe("chat.completion");
    expect(response.model).toBe("local-model");
    expect(response.choices[0]?.message.role).toBe("assistant");
    expect(response.choices[0]?.message.content).toBe("Hola!");
  });

  test("createSSEChunk follows chat.completion.chunk shape", () => {
    const chunk = createSSEChunk("local-model", "Hi", false, "chatcmpl_stable", 123);
    expect(chunk.object).toBe("chat.completion.chunk");
    expect(chunk.id).toBe("chatcmpl_stable");
    expect(chunk.created).toBe(123);
    expect(chunk.choices[0]?.delta.content).toBe("Hi");
  });

  test("extractInferenceParams forwards supported OpenAI penalties", () => {
    expect(extractInferenceParams({
      messages: [{ role: "user", content: "Hi" }],
      frequency_penalty: 0.2,
      presence_penalty: 0.3,
      repeat_penalty: 1.1,
    }, 512)).toMatchObject({
      maxTokens: 512,
      frequencyPenalty: 0.2,
      presencePenalty: 0.3,
      repeatPenalty: 1.1,
    });
  });

  test("normalizeCompletionPrompt accepts string and array", () => {
    expect(normalizeCompletionPrompt("hola")).toBe("hola");
    expect(normalizeCompletionPrompt(["hola", "mundo"])).toBe("hola\nmundo");
  });

  test("createCompletionResponse follows text_completion shape", () => {
    const response = createCompletionResponse("local-model", "Hola!");
    expect(response.object).toBe("text_completion");
    expect(response.model).toBe("local-model");
    expect(response.choices[0]?.text).toBe("Hola!");
  });

  test("createCompletionSSEChunk follows text_completion stream shape", () => {
    const chunk = createCompletionSSEChunk("local-model", "Hi");
    expect(chunk.object).toBe("text_completion");
    expect(chunk.choices[0]?.text).toBe("Hi");
    expect(chunk.choices[0]?.finish_reason).toBeNull();
  });
});
