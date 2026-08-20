import { describe, expect, test } from "vitest";
import { buildPromptOptions, toLlamaChatHistory } from "../src/llamacpp";

describe("node-llama-cpp contract", () => {
  test("converts OpenAI multi-turn messages to node-llama-cpp v3 history", () => {
    expect(toLlamaChatHistory([
      { role: "system", content: "Be concise" },
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Follow-up" },
    ])).toEqual({
      history: [
        { type: "system", text: "Be concise" },
        { type: "user", text: "First question" },
        { type: "model", response: ["First answer"] },
      ],
      prompt: "Follow-up",
    });
  });

  test("requires the final message to be from the user", () => {
    expect(() => toLlamaChatHistory([
      { role: "user", content: "Question" },
      { role: "assistant", content: "Answer" },
    ])).toThrow("Last message must be from user");
  });

  test("maps supported sampling options to node-llama-cpp v3 names", () => {
    expect(buildPromptOptions({
      temperature: 0.2,
      maxTokens: 100,
      topP: 0.9,
      topK: 20,
      seed: 42,
      stop: ["END"],
      repeatPenalty: 1.1,
      frequencyPenalty: 0.3,
      presencePenalty: 0.4,
    })).toEqual({
      temperature: 0.2,
      maxTokens: 100,
      topP: 0.9,
      topK: 20,
      seed: 42,
      customStopTriggers: ["END"],
      repeatPenalty: {
        penalty: 1.1,
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
      },
    });
  });
});
