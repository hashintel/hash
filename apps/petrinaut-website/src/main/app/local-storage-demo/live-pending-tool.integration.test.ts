/**
 * @vitest-environment jsdom
 */
// oxlint-disable-next-line typescript/triple-slash-reference -- The rendered source fixture needs the package's CSS-only module declarations.
/// <reference path="../../../../../../libs/@hashintel/petrinaut/src/ui/fontsource.d.ts" />
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { fauxProvider } from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";
import { cleanup, render, screen } from "@testing-library/react";
import { getToolName, isToolUIPart, readUIMessageStream } from "ai";
import { createElement } from "react";
import { afterEach, beforeAll, expect, test } from "vitest";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";

import { AiAssistantContents } from "../../../../../../libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/ai-assistant-contents";
import { withBufferedToolAdmission } from "../../../../../brunch-agent/src/provider-admission";
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
});

afterEach(cleanup);

test("bounds a native OpenAI tool row that stops after one argument delta", async () => {
  process.env.BRUNCH_CHAT_MODEL = "openai/gpt-5.6-sol";
  process.env.BRUNCH_CHAT_THINKING = "low";
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  const faux = fauxProvider({
    models: [{ id: "gpt-5.6-sol", reasoning: true }],
    provider: "openai",
  });
  const requests: Record<string, unknown>[] = [];
  const stall = createNativeOpenaiToolStall("mutate_workpiece");

  const application = await loadBuiltBrunchApplication();
  let retryAvailable = true;
  setProvider(
    withBufferedToolAdmission(
      nativeOpenaiProvider(
        faux.provider,
        requests,
        async () => {},
        stall.response,
      ),
      () => true,
      new Set(),
      {
        cancellationTimeoutMs: 100,
        claimRetry: () => {
          const claimed = retryAvailable;
          retryAvailable = false;
          return claimed;
        },
        firstEventTimeoutMs: 3_000,
        idleTimeoutMs: 500,
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
    const consumed = (async () => {
      for await (const message of readUIMessageStream<PetrinautAiMessage>({
        stream,
      })) {
        if (
          message.parts.some(
            (part) =>
              isToolUIPart(part) &&
              getToolName(part) === "mutate_workpiece" &&
              part.toolCallId === firstAttempt.toolCallId &&
              part.state === "input-streaming",
          )
        ) {
          pendingMessage.resolve(structuredClone(message));
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
    expect(requests).toHaveLength(1);

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
    expect(requests).toHaveLength(2);
    const attempts = stall.attempts();
    expect(attempts).toHaveLength(2);
    expect(attempts.at(1)?.toolCallId).not.toBe(firstAttempt.toolCallId);
    expect(requests.at(1)?.model).toBe(requests.at(0)?.model);
    expect(requests.at(1)?.reasoning).toEqual(requests.at(0)?.reasoning);
    await Promise.all(attempts.map((attempt) => attempt.cancelled));
    await consumed.catch(() => {});

    const afterFailure = await client.history();
    expect(
      afterFailure.messages.filter((message) => message.purpose === "user"),
    ).toHaveLength(1);
    expect(
      afterFailure.messages.some((historyMessage) =>
        historyMessage.parts.some((part) => part.type === "dynamic-tool"),
      ),
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
