import type { UIMessageChunk } from "ai";
import { describe, expect, test, vi } from "vitest";

import { createDiagnosticsAwareAiTransport } from "./create-diagnostics-aware-ai-transport";
import type { PetrinautAiMessage, PetrinautAiTransport } from "./types";

const emptyStream = (): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

const createFakeTransport = () => {
  const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(() =>
    Promise.resolve(emptyStream()),
  );

  return {
    sendMessages,
    transport: {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages,
    } satisfies PetrinautAiTransport,
  };
};

const sendOptions = (messages: PetrinautAiMessage[]) =>
  ({
    abortSignal: undefined,
    chatId: "chat-1",
    messageId: undefined,
    messages,
    trigger: "submit-message",
  }) satisfies Parameters<PetrinautAiTransport["sendMessages"]>[0];

describe("createDiagnosticsAwareAiTransport", () => {
  test("adds transient diagnostics context to completed tool-result sends", async () => {
    const { sendMessages, transport } = createFakeTransport();
    const waitForDiagnosticsRefresh = vi.fn(() => Promise.resolve());
    const wrapped = createDiagnosticsAwareAiTransport({
      getDiagnosticsContext: () =>
        "Current TypeScript diagnostics (1 issue):\n- Transition: Infect lambda: error TS2304 at Ln 1, Col 1: Cannot find name 'x'.",
      transport,
      waitForDiagnosticsRefresh,
    });

    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-updateTransition",
            state: "output-available",
            toolCallId: "tool-1",
            input: {},
            output: { applied: true, title: "Updated transition Infect" },
          },
        ],
      } as PetrinautAiMessage,
    ];

    await wrapped.sendMessages(sendOptions(messages));

    expect(waitForDiagnosticsRefresh).toHaveBeenCalledOnce();
    expect(sendMessages).toHaveBeenCalledOnce();

    const sentMessages = sendMessages.mock.calls[0]![0].messages;
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[0]).toBe(messages[0]);
    expect(sentMessages[1]?.id).toBe("petrinaut-diagnostics-context");
    expect(sentMessages[1]?.role).toBe("user");

    const diagnosticsPart = sentMessages[1]?.parts[0];
    expect(diagnosticsPart?.type).toBe("text");
    if (diagnosticsPart?.type !== "text") {
      throw new Error("Expected diagnostics context to be a text part.");
    }
    expect(diagnosticsPart.text).toContain(
      "Petrinaut diagnostics context only",
    );
    expect(diagnosticsPart.text).toContain("Current TypeScript diagnostics");
  });

  test("delegates ordinary user-message sends unchanged", async () => {
    const { sendMessages, transport } = createFakeTransport();
    const waitForDiagnosticsRefresh = vi.fn(() => Promise.resolve());
    const wrapped = createDiagnosticsAwareAiTransport({
      getDiagnosticsContext: () => "No current TypeScript diagnostics.",
      transport,
      waitForDiagnosticsRefresh,
    });
    const messages: PetrinautAiMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Explain this net." }],
      },
    ];

    await wrapped.sendMessages(sendOptions(messages));

    expect(waitForDiagnosticsRefresh).not.toHaveBeenCalled();
    expect(sendMessages.mock.calls[0]![0].messages).toBe(messages);
  });
});
