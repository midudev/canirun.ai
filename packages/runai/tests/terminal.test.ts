import { describe, expect, test } from "vitest";
import {
  parseThinkingBlock,
  createMarkdownRenderState,
  renderMarkdownDelta,
  flushMarkdownDelta,
} from "../src/terminal";

describe("parseThinkingBlock", () => {
  test("returns no thinking when text has no tags", () => {
    const result = parseThinkingBlock("Hello world");
    expect(result.hasThinking).toBe(false);
    expect(result.answerText).toBe("Hello world");
    expect(result.thinkingText).toBe("");
    expect(result.isOpen).toBe(false);
  });

  test("parses complete <think>...</think> block", () => {
    const result = parseThinkingBlock("<think>reasoning here</think>final answer");
    expect(result.hasThinking).toBe(true);
    expect(result.thinkingText).toBe("reasoning here");
    expect(result.answerText).toBe("final answer");
    expect(result.isOpen).toBe(false);
  });

  test("parses complete <thinking>...</thinking> block", () => {
    const result = parseThinkingBlock("<thinking>deep thought</thinking>the answer");
    expect(result.hasThinking).toBe(true);
    expect(result.thinkingText).toBe("deep thought");
    expect(result.answerText).toBe("the answer");
    expect(result.isOpen).toBe(false);
  });

  test("detects open (unclosed) thinking block", () => {
    const result = parseThinkingBlock("<think>still thinking...");
    expect(result.hasThinking).toBe(true);
    expect(result.thinkingText).toBe("still thinking...");
    expect(result.answerText).toBe("");
    expect(result.isOpen).toBe(true);
  });

  test("parses begin_of_thought / end_of_thought", () => {
    const result = parseThinkingBlock("<|begin_of_thought|>step by step<|end_of_thought|>result");
    expect(result.hasThinking).toBe(true);
    expect(result.thinkingText).toBe("step by step");
    expect(result.answerText).toBe("result");
    expect(result.isOpen).toBe(false);
  });

  test("handles empty text", () => {
    const result = parseThinkingBlock("");
    expect(result.hasThinking).toBe(false);
    expect(result.answerText).toBe("");
  });
});

describe("markdown delta rendering", () => {
  test("creates initial state correctly", () => {
    const state = createMarkdownRenderState();
    expect(state.inCodeBlock).toBe(false);
    expect(state.codeLang).toBe("");
    expect(state.lineBuffer).toBe("");
  });

  test("renderMarkdownDelta buffers partial lines", () => {
    const state = createMarkdownRenderState();
    const out = renderMarkdownDelta("hello", state);
    expect(out).toBe("");
    expect(state.lineBuffer).toBe("hello");
  });

  test("renderMarkdownDelta outputs complete lines", () => {
    const state = createMarkdownRenderState();
    const out = renderMarkdownDelta("hello\nworld\n", state);
    expect(out).toContain("hello");
    expect(out).toContain("world");
    expect(state.lineBuffer).toBe("");
  });

  test("flushMarkdownDelta outputs remaining buffer", () => {
    const state = createMarkdownRenderState();
    renderMarkdownDelta("partial", state);
    const out = flushMarkdownDelta(state);
    expect(out).toContain("partial");
    expect(state.lineBuffer).toBe("");
  });

  test("flushMarkdownDelta returns empty for empty buffer", () => {
    const state = createMarkdownRenderState();
    const out = flushMarkdownDelta(state);
    expect(out).toBe("");
  });
});
