import * as p from "@clack/prompts";
import { basename } from "node:path";
import {
  createPersistentChatSession,
  isModelLoaded,
  unloadModel,
  type PersistentChatSession,
} from "../llamacpp";
import { loadModelWithProgress } from "./model-lifecycle";
import { pausePromptFooter, resumePromptFooter, setPromptFooter } from "../prompt-footer";
import { ChatScreen, formatChatMetrics } from "../chat-screen";
import {
  accumulateChatChunk,
  createChatStreamState,
  finalizeChatStream,
} from "../chat-stream";
import { RUNAI_DEFAULT_MAX_TOKENS } from "../config";
import {
  countGeneratedTokens,
  resolveChatModel,
  stripGguf,
  type ChatOutcome,
  type PromptNavigationOptions,
} from "../cli-utils";

interface StreamedReply {
  answer: string;
  thinking: string;
  hasThinking: boolean;
  thinkingMs: number;
  completionTokens: number;
}

async function streamReply(
  chatSession: PersistentChatSession,
  prompt: string,
  onUpdate: (state: { thinking: string; answer: string; thoughtOpen: boolean }) => void,
): Promise<StreamedReply> {
  let state = createChatStreamState();
  let thinkStartedAt: number | null = null;
  let thinkEndedAt: number | null = null;

  const result = await chatSession.prompt(
    prompt,
    { temperature: 0.7, maxTokens: RUNAI_DEFAULT_MAX_TOKENS },
    (chunk) => {
      state = accumulateChatChunk(state, chunk);
      if (state.thinking && !thinkStartedAt) thinkStartedAt = Date.now();
      if (!state.thoughtOpen && state.thinking && !thinkEndedAt) thinkEndedAt = Date.now();
      onUpdate(state);
    },
  );

  const finalized = finalizeChatStream(state, result.text);
  const thinkingMs = thinkStartedAt && thinkEndedAt && thinkEndedAt >= thinkStartedAt
    ? thinkEndedAt - thinkStartedAt
    : thinkStartedAt
      ? Math.max(0, Date.now() - thinkStartedAt)
      : 0;
  return {
    answer: finalized.answer,
    thinking: finalized.thinking,
    hasThinking: Boolean(finalized.thinking),
    thinkingMs,
    completionTokens: result.completionTokens,
  };
}

async function runFullscreenChat(
  chatSession: PersistentChatSession,
  modelName: string,
): Promise<"back" | "exit"> {
  const screen = new ChatScreen(modelName);
  pausePromptFooter();
  screen.enter();
  try {
    while (true) {
      const raw = await screen.readLine();
      if (raw === null) return "back";
      const prompt = raw.trim();
      if (!prompt) continue;
      if (prompt === "/think" || prompt === "/thinking") {
        screen.toggleThinking();
        continue;
      }
      if (prompt === "/exit" || prompt === "/quit") return "exit";

      screen.set({ turns: [...screen.state.turns, { role: "user", text: prompt }], input: "" }, true);
      screen.startLive();
      const stopHotkeys = screen.watchHotkeys();
      const startedAt = Date.now();
      try {
        const reply = await streamReply(chatSession, prompt, (live) => {
          screen.updateLive({
            status: live.thoughtOpen && !live.answer ? "thinking" : live.answer ? "replying" : "thinking",
            thinking: live.thinking,
            answer: live.answer,
          });
        });
        const elapsedMs = Math.max(1, Date.now() - startedAt);
        const tokens = countGeneratedTokens(
          reply.thinking,
          reply.answer,
          reply.completionTokens,
        );
        screen.finishTurn({
          role: "assistant",
          text: reply.answer || "…",
          thinking: reply.thinking,
          metrics: formatChatMetrics({
            tokensPerSec: tokens / (elapsedMs / 1000),
            elapsedMs,
            thinkingMs: reply.hasThinking ? reply.thinkingMs : undefined,
          }),
        });
      } catch (error) {
        screen.finishTurn({
          role: "assistant",
          text: error instanceof Error ? error.message : "Inference failed",
        });
      } finally {
        stopHotkeys();
      }
    }
  } finally {
    screen.exit();
    resumePromptFooter();
    setPromptFooter("");
  }
}

async function runPlainChat(chatSession: PersistentChatSession): Promise<ChatOutcome> {
  while (true) {
    const userInput = await p.text({ message: "You" });
    if (p.isCancel(userInput)) return "back";
    const prompt = userInput.trim();
    if (!prompt) continue;
    if (prompt === "/exit" || prompt === "/quit") return "exit";
    p.log.step("Thinking...");
    try {
      const reply = await streamReply(chatSession, prompt, () => {});
      p.log.message(reply.answer, { symbol: "🤖" });
    } catch (error) {
      p.log.error(error instanceof Error ? error.message : "Inference failed");
    }
  }
}

export async function handleChat(
  args: string[],
  options: PromptNavigationOptions = {},
): Promise<ChatOutcome> {
  let modelPath: string;
  try {
    const resolvedModelPath = await resolveChatModel(args, options);
    if (!resolvedModelPath) return "back";
    modelPath = resolvedModelPath;
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : "Unable to start chat.");
    return "back";
  }

  if (!isModelLoaded()) {
    try {
      await loadModelWithProgress(modelPath);
    } catch {
      return "back";
    }
  }

  let chatSession: PersistentChatSession;
  try {
    chatSession = await createPersistentChatSession(modelPath);
  } catch (error) {
    p.log.error(error instanceof Error ? error.message : "Failed to start chat session.");
    return "back";
  }

  const useFullscreen = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  let outcome: ChatOutcome = "back";
  try {
    outcome = useFullscreen
      ? await runFullscreenChat(chatSession, stripGguf(basename(modelPath)))
      : await runPlainChat(chatSession);
    if (outcome === "exit" && !options.allowBackOnCancel) {
      p.outro("Chat ended.");
    }
    return outcome;
  } finally {
    await chatSession.dispose();
    if (outcome === "exit" || !options.allowBackOnCancel) {
      await unloadModel();
    }
    setPromptFooter("");
  }
}
