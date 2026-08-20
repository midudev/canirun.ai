import { describe, expect, test } from "vitest";
import {
  buildTranscriptLines,
  getInputCursor,
  lastLines,
  renderChatFrame,
  visibleInputValue,
  type ChatScreenModel,
} from "../src/chat-screen";
import { padAnsi, wrapAnsi } from "../src/terminal";

const empty: ChatScreenModel = {
  modelName: "qwen3.5-0.8b",
  showThinking: true,
  turns: [],
  live: null,
  input: "",
};

describe("wrapAnsi and padAnsi", () => {
  test("wraps long text to the requested width", () => {
    expect(wrapAnsi("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  test("keeps explicit newlines", () => {
    expect(wrapAnsi("one\ntwo", 10)).toEqual(["one", "two"]);
  });

  test("pads short lines and truncates long ones", () => {
    expect(padAnsi("hi", 5)).toBe("hi   ");
    expect(padAnsi("hello world", 5).length).toBeGreaterThan(0);
    expect(padAnsi("hello world", 5).includes("…")).toBe(true);
  });
});

describe("chat frame layout", () => {
  test("lastLines keeps the newest content and pads the rest", () => {
    expect(lastLines(["a", "b", "c"], 2)).toEqual(["b", "c"]);
    expect(lastLines(["a"], 3)).toEqual(["a", "", ""]);
  });

  test("renderChatFrame always fills the terminal height", () => {
    const frame = renderChatFrame(empty, 40, 12);
    expect(frame.startsWith("\u001b[H")).toBe(true);
    expect(frame.split("\n")).toHaveLength(12);
  });

  test("live thinking stays on a single status region", () => {
    const lines = buildTranscriptLines({
      ...empty,
      turns: [{ role: "user", text: "Hola" }],
      live: { status: "thinking", thinking: "first\nsecond", answer: "" },
    }, 40);
    const thinkingRows = lines.filter((line) => line.includes("Thinking"));
    expect(thinkingRows).toHaveLength(1);
    expect(lines.some((line) => line.includes("Hola"))).toBe(true);
    expect(lines.some((line) => line.includes("second"))).toBe(true);
  });

  test("hides thinking tokens when the view is off", () => {
    const lines = buildTranscriptLines({
      ...empty,
      showThinking: false,
      turns: [{ role: "user", text: "Hola" }],
      live: { status: "thinking", thinking: "secret chain", answer: "" },
    }, 40);
    expect(lines.some((line) => line.includes("secret chain"))).toBe(false);
    expect(lines.some((line) => line.includes("Thinking"))).toBe(true);
  });

  test("places the input cursor after the prompt and typed text", () => {
    expect(visibleInputValue("", 40)).toEqual({ text: "", cursorCol: 3 });
    expect(visibleInputValue("hola", 40)).toEqual({ text: "hola", cursorCol: 7 });
    const cursor = getInputCursor({ ...empty, input: "hola" }, 40, 12);
    expect(cursor).toEqual({ row: 11, col: 7 });
    expect(getInputCursor({
      ...empty,
      live: { status: "thinking", thinking: "", answer: "" },
    }, 40, 12)).toBeNull();
  });
});
