import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";
import { getToolName, isToolUIPart, readUIMessageStream } from "ai";
import { afterAll, beforeAll, expect, test } from "vitest";

import { loadBuiltBrunchApplication } from "@apps/brunch-agent/testing/load-built-application";
import { createBrunchFlueAdapter } from "@apps/petrinaut-website/src/main/app/plugins/brunch/brunch-flue-adapter";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "@apps/petrinaut-website/src/main/app/plugins/brunch/brunch-panel-transport";
import {
  agentOwnershipHeaders,
  brunchEnv,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent";
import { installFauxProvider } from "@local/pi-faux-providers/install-faux-provider";
import {
  createNativeOpenaiToolStall,
  nativeOpenaiProvider,
} from "@local/pi-faux-providers/native-openai-provider";

import type { PetrinautAiMessage } from "@apps/petrinaut-website/src/main/app/plugins/brunch/chat/ai-assistant-panel";

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = () =>
    Promise.reject(
      new Error("External fetch is forbidden in the native OpenAI fixture."),
    );
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

test("bounds a native OpenAI tool row without replaying completed tool work", async () => {
  process.env.BRUNCH_CHAT_MODEL = "openai/gpt-5.6-sol";
  process.env.BRUNCH_CHAT_THINKING = "low";
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  process.env.NODE_ENV = "test";
  process.env[brunchEnv.modelStreamCancellationTimeoutMs] = "100";
  process.env[brunchEnv.modelStreamFirstEventTimeoutMs] = "3000";
  process.env[brunchEnv.modelStreamIdleTimeoutMs] = "500";
  process.env[brunchEnv.modelStreamReasoningStartTimeoutMs] = "3000";
  const faux = fauxProvider({
    models: [{ id: "gpt-5.6-sol", reasoning: true }],
    provider: "openai",
  });
  const requests: Record<string, unknown>[] = [];
  const stall = createNativeOpenaiToolStall("ledger_commit");
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("ping", {}, { id: "call_completed|fc_completed" })],
      { stopReason: "toolUse" },
    ),
  ]);

  installFauxProvider(
    nativeOpenaiProvider(
      faux.provider,
      requests,
      async () => {},
      (input) => (input.requestIndex === 0 ? undefined : stall.response(input)),
    ),
  );
  const application = await loadBuiltBrunchApplication();
  const identity = {
    conversationId: `live-pending-${crypto.randomUUID()}`,
    ownerKey: "live-pending-owner",
  };
  const headers = agentOwnershipHeaders(identity);
  const instanceId = await flueConversationIdWeb(identity);
  const fetchApplication: typeof fetch = async (input, init) =>
    application.fetch(
      input instanceof Request ? input : new Request(input, init),
    );
  const client = createFlueClient({
    fetch: fetchApplication,
    headers,
    url: `http://brunch.test/agents/petrinaut/${instanceId}`,
  });
  const tracker = new BrunchPanelConversationTracker();
  const liveErrors: unknown[] = [];
  const transport = createBrunchPanelTransport(
    Promise.resolve(client),
    tracker,
    {
      adapter: createBrunchFlueAdapter({ clientToolNames: new Set() }),
      liveToolStream: {
        fetch: fetchApplication,
        headers,
        onError: (error) => liveErrors.push(error),
      },
    },
  );

  try {
    const abort = new AbortController();
    const stream = await transport.sendMessages({
      abortSignal: abort.signal,
      chatId: identity.conversationId,
      messageId: undefined,
      messages: [
        {
          id: "user-live-pending",
          parts: [{ type: "text", text: "Read the empty ledger." }],
          role: "user",
        },
      ],
      trigger: "submit-message",
    });
    const submissionId = tracker.submissionForInput("user-live-pending");
    if (submissionId === undefined) {
      throw new Error("The submitted message has no Flue submission id.");
    }
    const firstAttempt = await Promise.race([
      stall.reached,
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("The native OpenAI response did not start.")),
          5_000,
        );
      }),
    ]);
    const pendingMessage = Promise.withResolvers<PetrinautAiMessage>();
    const retryPendingMessage = Promise.withResolvers<PetrinautAiMessage>();
    const observedMessages: PetrinautAiMessage[] = [];
    const consumed = (async () => {
      for await (const message of readUIMessageStream<PetrinautAiMessage>({
        stream,
      })) {
        observedMessages.push(structuredClone(message));
        const pendingPart = message.parts.find(
          (part) =>
            isToolUIPart(part) &&
            getToolName(part) === "ledger_commit" &&
            part.state === "input-streaming",
        );
        if (pendingPart === undefined || !isToolUIPart(pendingPart)) continue;
        if (pendingPart.toolCallId === firstAttempt.toolCallId) {
          pendingMessage.resolve(structuredClone(message));
        } else {
          retryPendingMessage.resolve(structuredClone(message));
        }
      }
    })();

    void consumed.catch(() => {});
    await Promise.race([
      pendingMessage.promise,
      consumed.then(() => {
        throw new Error("The UI stream settled before the pending row.");
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("Pending row was not rendered.")),
          8_000,
        );
      }),
    ]);
    expect(liveErrors).toEqual([]);
    const beforeAdmission = await client.history();
    expect(
      beforeAdmission.messages.some((historyMessage) =>
        historyMessage.parts.some(
          (part) =>
            part.type === "dynamic-tool" &&
            part.toolCallId === firstAttempt.toolCallId,
        ),
      ),
    ).toBe(false);

    expect(requests).toHaveLength(2);

    await Promise.race([
      retryPendingMessage.promise,
      consumed.then(() => {
        throw new Error("The UI stream settled before showing the retry.");
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("The retry row was not rendered.")),
          5_000,
        );
      }),
    ]);
    await firstAttempt.cancelled;

    const outcome = await Promise.race([
      client.read(submissionId).then(
        () => "completed" as const,
        () => "failed" as const,
      ),
      new Promise<"still-running">((resolve) => {
        setTimeout(() => resolve("still-running"), 15_000);
      }),
    ]);
    expect(outcome).toBe("failed");
    expect(requests).toHaveLength(3);
    const attempts = stall.attempts();
    expect(attempts).toHaveLength(2);
    expect(attempts.at(1)?.toolCallId).not.toBe(firstAttempt.toolCallId);
    expect(requests.at(2)?.model).toBe(requests.at(1)?.model);
    expect(requests.at(2)?.reasoning).toEqual(requests.at(1)?.reasoning);
    await Promise.all(attempts.map((attempt) => attempt.cancelled));
    await consumed.catch(() => {});
    const retryToolCallId = attempts.at(1)?.toolCallId;
    const terminalMessage = observedMessages.findLast((message) =>
      message.parts.some(
        (part) => isToolUIPart(part) && part.toolCallId === retryToolCallId,
      ),
    );
    const terminalPart = terminalMessage?.parts.find(
      (part) => isToolUIPart(part) && part.toolCallId === retryToolCallId,
    );
    expect(terminalPart).toMatchObject({
      state: "output-error",
      errorText: "This tool proposal was not executed.",
    });
    expect(
      terminalMessage?.parts
        .filter(isToolUIPart)
        .filter((part) => getToolName(part) === "ledger_commit")
        .map((part) => part.state),
    ).toEqual(["output-error", "output-error"]);
    expect(stall.chronology()).toEqual([
      { kind: "started", toolCallId: attempts.at(0)?.toolCallId },
      { kind: "cancelled", toolCallId: attempts.at(0)?.toolCallId },
      { kind: "started", toolCallId: attempts.at(1)?.toolCallId },
      { kind: "cancelled", toolCallId: attempts.at(1)?.toolCallId },
    ]);

    const afterFailure = await client.history();
    expect(
      afterFailure.messages.filter((message) => message.purpose === "user"),
    ).toHaveLength(1);
    const canonicalTools = afterFailure.messages.flatMap((historyMessage) =>
      historyMessage.parts.filter((part) => part.type === "dynamic-tool"),
    );
    expect(
      canonicalTools.filter((part) => part.toolName === "ping"),
    ).toHaveLength(1);
    expect(
      canonicalTools.some((part) => part.toolName === "ledger_commit"),
    ).toBe(false);
  } finally {
    await client.abort().catch(() => undefined);
    await Promise.race([
      stall.cancelled,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      }),
    ]);
    await application.stop();
  }
}, 25_000);
