import { describe, expect, test } from "vitest";
import {
  accumulateChatChunk,
  createChatStreamState,
  finalizeChatStream,
} from "../src/chat-stream";

describe("accumulateChatChunk", () => {
  test("keeps thought tokens out of the visible answer", () => {
    let state = createChatStreamState();
    state = accumulateChatChunk(state, { text: "razonando", segmentType: "thought" });
    state = accumulateChatChunk(state, { text: "Hola", segmentType: "main" });
    expect(state.thinking).toBe("razonando");
    expect(state.answer).toBe("Hola");
    expect(state.thoughtOpen).toBe(false);
  });

  test("promotes late main tokens even if thought never closed", () => {
    let state = createChatStreamState();
    state = accumulateChatChunk(state, { text: "think", segmentType: "thought" });
    expect(state.thoughtOpen).toBe(true);
    state = accumulateChatChunk(state, { text: "respuesta", segmentType: "main" });
    expect(state.answer).toBe("respuesta");
    expect(state.thoughtOpen).toBe(false);
  });

  test("treats comments as visible answer, not thinking", () => {
    let state = createChatStreamState();
    state = accumulateChatChunk(state, { text: "visible", segmentType: "comment" });
    expect(state.answer).toBe("visible");
    expect(state.thinking).toBe("");
  });
});

describe("finalizeChatStream", () => {
  test("uses the model return value when streamed answer is empty", () => {
    expect(finalizeChatStream(createChatStreamState(), "Hola, ¿qué tal?")).toEqual({
      thinking: "",
      answer: "Hola, ¿qué tal?",
    });
  });

  test("extracts an answer hidden after a think block in the fallback", () => {
    expect(finalizeChatStream(
      { thinking: "plan", answer: "", thoughtOpen: false },
      "<think>plan</think>Respuesta final",
    )).toEqual({
      thinking: "plan",
      answer: "Respuesta final",
    });
  });

  test("shows thinking as the reply when the model never left the thought segment", () => {
    expect(finalizeChatStream({
      thinking: "solo he pensado esto",
      answer: "",
      thoughtOpen: true,
    })).toEqual({
      thinking: "",
      answer: "solo he pensado esto",
    });
  });
});
