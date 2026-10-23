// @vitest-environment jsdom
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import { createFlueClient } from "@flue/sdk";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getToolName, isToolUIPart, readUIMessageStream } from "ai";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { loadBuiltBrunchApplication } from "@apps/brunch-agent/testing/load-built-application";
import { createBrunchFlueAdapter } from "@apps/petrinaut-website/src/main/app/plugins/brunch/brunch-flue-adapter";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "@apps/petrinaut-website/src/main/app/plugins/brunch/brunch-panel-transport";
import {
  BrunchAssistantContext,
  brunchPlugin,
} from "@apps/petrinaut-website/src/main/app/plugins/brunch/editor-api-plugin";
import { resolveBrunchToolPresentation } from "@apps/petrinaut-website/src/main/app/plugins/brunch/tools/brunch-tool-presentation";
import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadMonaco,
} from "@apps/petrinaut-website/src/main/app/shared/petrinaut-jsdom";
import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import type { PetrinautAiMessage } from "@apps/petrinaut-website/src/main/app/plugins/brunch/chat/ai-assistant-panel";
import type { PetrinautAiAssistant } from "@apps/petrinaut-website/src/main/app/plugins/brunch/chat/petrinaut";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("@apps/petrinaut-website/src/main/app/shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const adapter = createBrunchFlueAdapter({ clientToolNames: new Set() });

const originalFetch = globalThis.fetch;

const entity = (name: string) => [
  "entity/create",
  { name, kind: "resource", origin: "stated", status: "confirmed" },
];
const claimAbout = (entityId: string, text: string) => [
  "claim/create",
  { text, entities: [entityId], origin: "stated", status: "confirmed" },
];
const commitName = "ledger_commit";

beforeAll(async () => {
  globalThis.fetch = () =>
    Promise.reject(new Error("External fetch is forbidden in this fixture."));
  // Kept until the environment is disposed: the editor loads both lazily.
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  await preloadMonaco();
}, 30_000);

afterAll(() => {
  globalThis.fetch = originalFetch;
});
afterEach(cleanup);

/**
 * Opens Brunch's own chat on `messages` in the real editor, as the website
 * does: the host provides the assistant and the Brunch plugin renders it.
 */
const renderAssistant = (messages: readonly PetrinautAiMessage[]) => {
  const assistant: PetrinautAiAssistant = {
    presentation: "brunch",
    messages: [...messages],
    resolveToolPresentation: resolveBrunchToolPresentation,
    transport: {
      sendMessages: () => new Promise(() => {}),
      reconnectToStream: async () => null,
    },
  };
  render(
    <BrunchAssistantContext value={assistant}>
      <Petrinaut
        handle={createJsonDocHandle({
          initial: { places: [], transitions: [] },
        })}
        plugins={[brunchPlugin]}
      />
    </BrunchAssistantContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" }));
};

const expandSettledTools = async () => {
  const activity = await screen.findByRole("button", { name: /^Activity/u });
  fireEvent.click(activity);
  await waitFor(() =>
    expect(activity.getAttribute("aria-expanded")).toBe("true"),
  );
  const tools = screen.getByRole("button", { name: /^Used \d+ tools?$/u });
  fireEvent.click(tools);
  await waitFor(() => expect(tools.getAttribute("aria-expanded")).toBe("true"));
};

test("presents pending calls as pending, and renders applied green, typed refusal compact, and thrown red across reopen", async () => {
  process.env.BRUNCH_CHAT_MODEL = "openai/faux-model";
  process.env.BRUNCH_CHAT_THINKING = "medium";
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  const faux = fauxProvider({
    models: [{ id: "faux-model", reasoning: true }],
    provider: "openai",
  });
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          commitName,
          { entries: [entity("The reservoir")] },
          { id: "applied-first" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          commitName,
          { entries: [claimAbout("e99", "Refers to nothing.")] },
          { id: "refused-reference" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          commitName,
          { entries: [claimAbout("e1", "The reservoir overflows.")] },
          { id: "applied-second" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [fauxToolCall(commitName, {}, { id: "thrown-invalid" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText("TEST applied, refused, corrected, and thrown outcomes."),
    ]),
  ]);

  const application = await loadBuiltBrunchApplication();
  setProvider(faux.provider);
  const identity = {
    conversationId: `ledger-refusal-${crypto.randomUUID()}`,
    ownerKey: "ledger-refusal-owner",
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
  const transport = createBrunchPanelTransport(
    Promise.resolve(client),
    tracker,
    {
      adapter,
      initialData: {
        binding: {
          conversationId: identity.conversationId,
          documentId: "TEST-document",
        },
      },
    },
  );

  try {
    const stream = await transport.sendMessages({
      abortSignal: new AbortController().signal,
      chatId: identity.conversationId,
      messageId: undefined,
      messages: [
        {
          id: "user-ledger-refusal",
          parts: [
            { type: "text", text: "Record, refuse, correct, then fail." },
          ],
          role: "user",
        },
      ],
      trigger: "submit-message",
    });
    const pendingInputById = new Map<string, unknown>();
    let terminalMessage: PetrinautAiMessage | undefined;
    for await (const message of readUIMessageStream<PetrinautAiMessage>({
      stream,
    })) {
      terminalMessage = structuredClone(message);
      for (const part of message.parts) {
        if (
          !isToolUIPart(part) ||
          getToolName(part) !== commitName ||
          (part.state !== "input-streaming" && part.state !== "input-available")
        ) {
          continue;
        }
        if (!pendingInputById.has(part.toolCallId)) {
          pendingInputById.set(part.toolCallId, structuredClone(part.input));
        }
      }
    }
    if (terminalMessage === undefined) {
      throw new Error("The UI stream produced no assistant message.");
    }

    for (const toolCallId of [
      "applied-first",
      "refused-reference",
      "applied-second",
    ]) {
      expect(
        pendingInputById.has(toolCallId),
        `pending call missing for ${toolCallId}`,
      ).toBe(true);
      // Petrinaut draws a pending row only while its own chat streams, which
      // its public props cannot set; the tone it draws is Brunch's, from here.
      expect(
        resolveBrunchToolPresentation({
          toolName: commitName,
          state: "pending",
          input: pendingInputById.get(toolCallId),
          output: undefined,
          error: undefined,
        })?.tone,
      ).toBe("pending");
    }

    cleanup();
    renderAssistant([terminalMessage]);
    await expandSettledTools();
    const appliedRows = screen.getAllByRole("button", {
      name: /Recorded in the Ledger/u,
    });
    expect(appliedRows).toHaveLength(2);
    expect(
      appliedRows.every((row) => row.getAttribute("data-tone") === "success"),
    ).toBe(true);
    expect(
      appliedRows.every(
        (row) => row.querySelector('[data-tool-status="ok"]') !== null,
      ),
    ).toBe(true);

    const refusedRow = screen.getByRole("button", {
      name: /Ledger commit needs correction/u,
    });
    expect(refusedRow.getAttribute("data-tone")).toBe("neutral");
    expect(refusedRow.querySelector('[data-tool-status="ok"]')).not.toBeNull();
    expect(within(refusedRow).queryByTestId("tool-detail")).toBeNull();
    fireEvent.click(refusedRow);
    expect(screen.getAllByText(/Unknown entity e99/u).length).toBeGreaterThan(
      0,
    );

    const thrownRow = screen.getByRole("button", {
      name: /Could not record in the Ledger/u,
    });
    expect(thrownRow.getAttribute("data-tone")).toBe("danger");

    const history = await client.history();
    const canonicalIds = history.messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === "dynamic-tool" && part.toolName === commitName
          ? [part.toolCallId]
          : [],
      ),
    );
    expect(canonicalIds).toEqual([
      "applied-first",
      "refused-reference",
      "applied-second",
      "thrown-invalid",
    ]);
    const refusedPart = history.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === "refused-reference",
      );
    expect(refusedPart).toMatchObject({
      state: "output-available",
      output: { status: "refused", code: "unknown-address" },
    });
    const thrownPart = history.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === "thrown-invalid",
      );
    expect(thrownPart).toMatchObject({ state: "output-error" });

    const reopened = adapter.reopen(history);
    cleanup();
    renderAssistant(reopened);
    await expandSettledTools();
    expect(
      screen.getAllByRole("button", { name: /Recorded in the Ledger/u }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Ledger commit needs correction/u }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Could not record in the Ledger/u }),
    ).not.toBeNull();
  } finally {
    await client.abort().catch(() => undefined);
    await application.stop();
  }
}, 25_000);
