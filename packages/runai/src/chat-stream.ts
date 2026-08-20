import { parseThinkingBlock } from "./terminal";
import type { LlamaStreamChunk } from "./llamacpp";

export interface ChatStreamState {
  thinking: string;
  answer: string;
  thoughtOpen: boolean;
}

export function createChatStreamState(): ChatStreamState {
  return { thinking: "", answer: "", thoughtOpen: false };
}

export function accumulateChatChunk(
  state: ChatStreamState,
  chunk: LlamaStreamChunk,
): ChatStreamState {
  if (chunk.segmentType === "thought") {
    return {
      thinking: state.thinking + chunk.text,
      answer: state.answer,
      thoughtOpen: chunk.segmentEnd ? false : true,
    };
  }

  return {
    thinking: state.thinking,
    answer: state.answer + chunk.text,
    thoughtOpen: false,
  };
}

export function finalizeChatStream(
  state: ChatStreamState,
  fallbackText = "",
): { thinking: string; answer: string } {
  let thinking = state.thinking.trim();
  let answer = state.answer.trim();

  if (!answer && fallbackText.trim()) {
    const parsed = parseThinkingBlock(fallbackText);
    if (parsed.hasThinking) {
      thinking = thinking || parsed.thinkingText.trim();
      answer = parsed.answerText.trim();
    } else {
      answer = fallbackText.trim();
    }
  }

  if (!answer && thinking) {
    const parsed = parseThinkingBlock(thinking);
    if (parsed.hasThinking && parsed.answerText.trim()) {
      thinking = parsed.thinkingText.trim();
      answer = parsed.answerText.trim();
    } else {
      answer = thinking;
      thinking = "";
    }
  }

  return { thinking, answer };
}
