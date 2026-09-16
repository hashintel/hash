/**
 * @vitest-environment jsdom
 */
// oxlint-disable-next-line typescript/triple-slash-reference -- The rendered source fixture needs the package's CSS-only module declarations.
/// <reference path="../../../../../../libs/@hashintel/petrinaut/src/ui/fontsource.d.ts" />
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";
import { cleanup, render, screen } from "@testing-library/react";
import { getToolName, isToolUIPart, readUIMessageStream } from "ai";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";

import { AiAssistantContents } from "../../../../../../libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/ai-assistant-contents";
import {
  claimModelStreamIdleRetry,
  withBufferedToolAdmission,
} from "../../../../../brunch-agent/src/provider-admission";
import {
  createNativeOpenaiToolStall,
  nativeOpenaiProvider,
} from "../../../../../brunch-agent/test/native-openai-provider";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";
import { resolveBrunchToolPresentation } from "./brunch-tool-presentation";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const noop = () => {};
const originalFetch = globalThis.fetch;

type BuiltBrunchApplication = {
  readonly fetch: typeof fetch;
  readonly stop: () => Promise<void>;
};

const loadBuiltBrunchApplication =
  async (): Promise<BuiltBrunchApplication> => {
    const url = pathToFileURL(
      join(process.cwd(), "../brunch-agent/dist/app.mjs"),
    ).href;
    const module = (await import(url)) as {
      readonly loadFlueNodeApplication: () => Promise<BuiltBrunchApplication>;
    };
    return module.loadFlueNodeApplication();
  };

beforeAll(() => {
  globalThis.ResizeObserver = class {
    public disconnect() {}
    public observe() {}
    public unobserve() {}
  };
  globalThis.fetch = () =>
    Promise.reject(
      new Error("External fetch is forbidden in the native OpenAI fixture."),
    );
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
afterEach(cleanup);

test("bounds a native OpenAI tool row without replaying completed tool work", async () => {
  process.env.BRUNCH_CHAT_MODEL = "openai/gpt-5.6-sol";
  process.env.BRUNCH_CHAT_THINKING = "low";
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  const faux = fauxProvider({
    models: [{ id: "gpt-5.6-sol", reasoning: true }],
    provider: "openai",
  });
  const requests: Record<string, unknown>[] = [];
  const stall = createNativeOpenaiToolStall("mutate_workpiece");
  faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("ping", {}, { id: "call_completed|fc_completed" })],
      { stopReason: "toolUse" },
    ),
  ]);

  const application = await loadBuiltBrunchApplication();
  const retryScope = { idleRetryAvailable: true };
  setProvider(
    withBufferedToolAdmission(
      nativeOpenaiProvider(
        faux.provider,
        requests,
        async () => {},
        (input) =>
          input.requestIndex === 0 ? undefined : stall.response(input),
      ),
      () => true,
      new Set(),
      {
        cancellationTimeoutMs: 100,
        claimRetry: () => claimModelStreamIdleRetry(retryScope),
        firstEventTimeoutMs: 3_000,
        idleTimeoutMs: 500,
        reasoningStartTimeoutMs: 3_000,
      },
    ),
  );
  const identity = {
    conversationId: `live-pending-${crypto.randomUUID()}`,
    principalKey: "live-pending-principal",
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
    url: `http://brunch.test/agents/chat/${instanceId}`,
  });
  const tracker = new BrunchPanelConversationTracker();
  const liveErrors: unknown[] = [];
  const transport = createBrunchPanelTransport(
    Promise.resolve(client),
    tracker,
    {
      clientToolNames: new Set(),
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
            getToolName(part) === "mutate_workpiece" &&
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
    const pending = await Promise.race([
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

    render(
      createElement(AiAssistantContents, {
        input: "",
        messages: [pending],
        onClose: noop,
        onInputChange: noop,
        onStop: noop,
        onSubmit: noop,
        resolveToolPresentation: resolveBrunchToolPresentation,
        status: "streaming",
      }),
    );
    const row = screen.getByRole("button", { name: /Updating ledger/u });
    expect(row.getAttribute("aria-busy")).toBe("true");
    expect(requests).toHaveLength(2);

    const retryPending = await Promise.race([
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
    cleanup();
    render(
      createElement(AiAssistantContents, {
        input: "",
        messages: [retryPending],
        onClose: noop,
        onInputChange: noop,
        onStop: noop,
        onSubmit: noop,
        resolveToolPresentation: resolveBrunchToolPresentation,
        status: "streaming",
      }),
    );
    expect(
      screen
        .getByRole("button", { name: /Updating ledger/u })
        .getAttribute("aria-busy"),
    ).toBe("true");

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
    cleanup();
    if (terminalMessage === undefined) {
      throw new Error("The retry has no terminal UI message.");
    }
    render(
      createElement(AiAssistantContents, {
        input: "",
        messages: [terminalMessage],
        onClose: noop,
        onInputChange: noop,
        onStop: noop,
        onSubmit: noop,
        resolveToolPresentation: resolveBrunchToolPresentation,
        status: "error",
      }),
    );
    const erroredRows = screen.getAllByRole("button", {
      name: /Could not update ledger/u,
    });
    expect(erroredRows).toHaveLength(2);
    expect(
      erroredRows.every(
        (erroredRow) => erroredRow.getAttribute("aria-busy") !== "true",
      ),
    ).toBe(true);
    expect(stall.chronology()).toEqual([
      { kind: "started", toolCallId: attempts.at(0)?.toolCallId },
      { kind: "cancelled", toolCallId: attempts.at(0)?.toolCallId },
      { kind: "started", toolCallId: attempts.at(1)?.toolCallId },
      { kind: "cancelled", toolCallId: attempts.at(1)?.toolCallId },
    ]);
    await consumed.catch(() => {});

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
      canonicalTools.some((part) => part.toolName === "mutate_workpiece"),
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
