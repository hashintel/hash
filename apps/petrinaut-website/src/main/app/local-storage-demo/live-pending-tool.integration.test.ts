/**
 * @vitest-environment jsdom
 */
// oxlint-disable-next-line typescript/triple-slash-reference -- The rendered source fixture needs the package's CSS-only module declarations.
/// <reference path="../../../../../../libs/@hashintel/petrinaut/src/ui/fontsource.d.ts" />
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Provider,
} from "@earendil-works/pi-ai";
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

test("renders a guarded live tool row before canonical admission", async () => {
  process.env.BRUNCH_CHAT_MODEL = "claude-sonnet-4-6";
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  const upstream = createAssistantMessageEventStream();
  const providerStarted = Promise.withResolvers<void>();
  const faux = fauxProvider({
    models: [{ id: "claude-sonnet-4-6", reasoning: true }],
    provider: "anthropic",
  });
  faux.setResponses([
    fauxAssistantMessage([fauxText("The ledger remains available.")]),
  ]);
  let firstRequest = true;
  const controlledProvider = {
    ...faux.provider,
    streamSimple(model, context, options) {
      if (!firstRequest) {
        return faux.provider.streamSimple(model, context, options);
      }
      firstRequest = false;
      providerStarted.resolve();
      return upstream;
    },
  } satisfies Provider;

  const application = await loadBuiltBrunchApplication();
  setProvider(controlledProvider);
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
    const stream = await transport.sendMessages({
      abortSignal: AbortSignal.timeout(10_000),
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
    expect(submissionId).toBeDefined();
    const pendingMessage = Promise.withResolvers<PetrinautAiMessage>();
    const consumed = (async () => {
      for await (const message of readUIMessageStream<PetrinautAiMessage>({
        stream,
      })) {
        if (
          message.parts.some(
            (part) =>
              isToolUIPart(part) &&
              getToolName(part) === "ping" &&
              part.toolCallId === "live-read-workpiece" &&
              part.state === "input-streaming",
          )
        ) {
          pendingMessage.resolve(structuredClone(message));
        }
      }
    })();

    await Promise.race([
      providerStarted.promise,
      consumed.then(() => {
        throw new Error("The response settled before the provider started.");
      }),
    ]);
    const toolCall = fauxToolCall("ping", {}, { id: "live-read-workpiece" });
    const message = fauxAssistantMessage([toolCall], {
      stopReason: "toolUse",
    });
    upstream.push({ partial: message, type: "start" });
    upstream.push({
      contentIndex: 0,
      partial: message,
      type: "toolcall_start",
    });
    upstream.push({
      contentIndex: 0,
      delta: "{",
      partial: message,
      type: "toolcall_delta",
    });

    const pending = await Promise.race([
      pendingMessage.promise,
      consumed.then(() => {
        throw new Error("The UI stream settled before the pending row.");
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("Pending row was not rendered.")),
          5_000,
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
            part.toolCallId === "live-read-workpiece",
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
    const row = screen.getByRole("button", {
      name: /Checking Brunch connection/u,
    });
    expect(row.getAttribute("aria-busy")).toBe("true");

    upstream.push({
      contentIndex: 0,
      partial: message,
      toolCall,
      type: "toolcall_end",
    });
    upstream.push({ message, reason: "toolUse", type: "done" });
    await consumed;
  } finally {
    try {
      upstream.push({
        error: fauxAssistantMessage([], { stopReason: "aborted" }),
        reason: "aborted",
        type: "error",
      });
    } catch {
      // The successful path already closed the controlled stream.
    }
    await client.abort().catch(() => undefined);
    await application.stop();
  }
}, 20_000);
