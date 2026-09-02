import { describe, expect, test } from "vitest";

import { definePetrinautAiInteractiveTool } from "../../../../../types/ai-interactive-tool";
import { partitionVoiceSessionMessages } from "./defer-voice-messages";

import type { PetrinautAiMessage } from "../types";

const confirmRelease = definePetrinautAiInteractiveTool({
  toolName: "confirmRelease",
  inputSchema: { parse: (raw: unknown) => raw as { question: string } },
  outputSchema: { parse: (raw: unknown) => raw as { approved: boolean } },
  component: () => null,
});

const messages = [
  {
    id: "before-session",
    role: "assistant",
    parts: [{ type: "text", text: "Earlier answer" }],
  },
  {
    id: "spoken-user",
    metadata: { source: "voice" },
    role: "user",
    parts: [{ type: "text", text: "Spoken request" }],
  },
  {
    id: "spoken-assistant",
    role: "assistant",
    parts: [{ type: "text", text: "Spoken reply" }],
  },
  {
    id: "typed-user",
    role: "user",
    parts: [{ type: "text", text: "Typed aside" }],
  },
  {
    id: "awaiting-tool",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "confirmRelease",
        state: "input-available",
        toolCallId: "call-1",
        input: { question: "Ship this change?" },
      },
    ],
  },
  {
    id: "answered-tool",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "confirmRelease",
        state: "output-available",
        toolCallId: "call-2",
        input: { question: "Ship the other change?" },
        output: { approved: true },
      },
    ],
  },
] as unknown as PetrinautAiMessage[];

const idsOf = (partitioned: PetrinautAiMessage[]) =>
  partitioned.map((message) => message.id);

describe("partitionVoiceSessionMessages", () => {
  test("defers the session's spoken turns and keeps the transcript before it", () => {
    const { deferred, visible } = partitionVoiceSessionMessages({
      deferredFromIndex: 1,
      interactiveTools: [confirmRelease],
      messages,
    });

    expect(idsOf(deferred)).toStrictEqual([
      "spoken-user",
      "spoken-assistant",
      "answered-tool",
    ]);
    expect(idsOf(visible)).toStrictEqual([
      "before-session",
      "typed-user",
      "awaiting-tool",
    ]);
  });

  test("defers nothing that predates the session", () => {
    const { deferred, visible } = partitionVoiceSessionMessages({
      deferredFromIndex: messages.length,
      interactiveTools: [confirmRelease],
      messages,
    });

    expect(deferred).toStrictEqual([]);
    expect(idsOf(visible)).toStrictEqual(idsOf(messages));
  });

  test("defers a widget whose tool the host never registered", () => {
    const { deferred } = partitionVoiceSessionMessages({
      deferredFromIndex: 0,
      interactiveTools: [],
      messages,
    });

    expect(idsOf(deferred)).toContain("awaiting-tool");
  });
});
