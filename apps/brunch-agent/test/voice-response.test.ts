import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { sqlite, start } from "@flue/runtime/node";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";
import { expect, test } from "vitest";

import {
  createFlueChatTransport,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
import { BRUNCH_VOICE_TOOL_NAME } from "@hashintel/brunch-agent/voice-response";

import { ChatAgent, CHAT_MODEL_ID } from "../src/agents/chat-agent/agent";

import type { UIMessageChunk } from "ai";

test("Voice speech crosses the real runtime and transport and survives restart beside the full response", async () => {
  const speech = "  Capacity is not established. Which limit matters?  ";
  const report =
    "# Full analysis\n\nCapacity is not established.\n\nWhich limit matters?\n\n```runbook-ir\n# Workpiece\nTiming remains unknown.\n```";
  const provider = fauxProvider({
    provider: "anthropic",
    models: [{ id: CHAT_MODEL_ID }],
  });
  provider.setResponses([
    fauxAssistantMessage(
      [fauxToolCall(BRUNCH_VOICE_TOOL_NAME, { speech }, { id: "speech-1" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "brunch_mark_question",
          { question: "Which limit matters?" },
          { id: "question-1" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([fauxText(report)]),
  ]);
  const directory = await mkdtemp(join(tmpdir(), "brunch-voice-response-"));
  const boot = () =>
    start({
      agents: [{ agent: ChatAgent, name: ChatAgent.agentName }],
      providers: [provider.provider],
      db: sqlite(join(directory, "conversation.db")),
    });
  let runtime = await boot();
  try {
    const router = createAgentRouter(ChatAgent);
    const client = createFlueClient({
      url: "http://local.test/voice-response",
      fetch: async (input, options) =>
        router.fetch(
          input instanceof Request ? input : new Request(input, options),
        ),
    });
    const transport = createFlueChatTransport({
      client,
      clientToolNames: new Set(),
    });
    const stream = await transport.sendMessages({
      chatId: "voice-response",
      trigger: "submit-message",
      messageId: undefined,
      messages: [
        {
          id: "voice-user",
          role: "user",
          metadata: { source: "voice" },
          parts: [{ type: "text", text: "Explain the limit." }],
        },
      ],
      abortSignal: undefined,
    });
    const chunks: UIMessageChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(chunks).toContainEqual({
      type: "data-brunch-voice-response",
      data: { speech, toolCallId: "speech-1" },
    });
    expect(chunks).toContainEqual({
      type: "tool-output-available",
      toolCallId: "speech-1",
      output: {
        title: "Brunch-authored speech (not playback confirmation)",
        detail: speech,
      },
      providerExecuted: true,
    });
    expect(
      chunks
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.delta)
        .join(""),
    ).toBe(report);
    expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });

    const before = snapshotToUiMessages(await client.history(), {
      clientToolNames: new Set(),
      hiddenToolNames: new Set(["brunch_mark_question"]),
    });
    const assistant = before.find((message) => message.role === "assistant");
    expect(assistant?.parts).toContainEqual({
      type: "data-brunch-voice-response",
      data: { speech, toolCallId: "speech-1" },
    });
    expect(assistant?.parts).toContainEqual({
      type: "text",
      text: report,
      state: "done",
    });
    expect(assistant?.parts).toContainEqual({
      type: "data-brunch-question",
      data: { question: "Which limit matters?", toolCallId: "question-1" },
    });
    await runtime.stop();
    runtime = await boot();
    expect(
      snapshotToUiMessages(await client.history(), {
        clientToolNames: new Set(),
        hiddenToolNames: new Set(["brunch_mark_question"]),
      }),
    ).toEqual(before);
  } finally {
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
