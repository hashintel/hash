/**
 * @vitest-environment jsdom
 */
// oxlint-disable-next-line typescript/triple-slash-reference -- The rendered source fixture needs the package's CSS-only module declarations.
/// <reference path="../../../../../../libs/@hashintel/petrinaut/src/ui/fontsource.d.ts" />
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
  within,
} from "@testing-library/react";
import { getToolName, isToolUIPart, readUIMessageStream } from "ai";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
  snapshotToUiMessages,
} from "@hashintel/brunch-agent-transport-aisdk";
import { brunchModes } from "@hashintel/brunch-agent/constants";
import { petrinautAiModel } from "@hashintel/petrinaut-core";

import { AiAssistantContents } from "../../../../../../libs/@hashintel/petrinaut/src/ui/views/Editor/panels/ai-assistant-panel/ai-assistant-contents";
import { loadBuiltBrunchApplication } from "../../../../../brunch-agent/test/load-built-application";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";
import { resolveBrunchToolPresentation } from "./brunch-tool-presentation";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const noop = () => {};
const originalFetch = globalThis.fetch;

const firstMarkdown = [
  "# Account",
  "",
  "## Purpose",
  "",
  "Explain the system.",
  "",
  "## Evidence",
  "",
  `${"Source detail. ".repeat(20)}`,
].join("\n");
const refusedMarkdown = "# Account\n\n## Purpose\n\nExplain the system.";
const correctedMarkdown = `${firstMarkdown}\n\nRetained conclusion.`;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    public disconnect() {}
    public observe() {}
    public unobserve() {}
  };
  globalThis.fetch = () =>
    Promise.reject(new Error("External fetch is forbidden in this fixture."));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
afterEach(cleanup);

const renderAssistant = (messages: readonly PetrinautAiMessage[]) =>
  render(
    <AiAssistantContents
      input=""
      messages={[...messages]}
      onClose={noop}
      onInputChange={noop}
      onStop={noop}
      onSubmit={noop}
      resolveToolPresentation={resolveBrunchToolPresentation}
      status="ready"
    />,
  );

test("renders pending gold, applied green, typed refusal compact, and thrown red across reopen", async () => {
  delete process.env.BRUNCH_CHAT_MODEL;
  delete process.env.BRUNCH_CHAT_THINKING;
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  const faux = fauxProvider({
    models: [{ id: petrinautAiModel.id, reasoning: true }],
    provider: "openai",
  });
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall(
          "mutate_workpiece",
          { markdown: firstMarkdown, baseRevisionId: null },
          { id: "applied-first" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "mutate_workpiece",
          { markdown: refusedMarkdown, baseRevisionId: "applied-first" },
          { id: "refused-shrink" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "mutate_workpiece",
          { markdown: correctedMarkdown, baseRevisionId: "applied-first" },
          { id: "applied-second" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "mutate_workpiece",
          { markdown: " \n\t", baseRevisionId: "applied-second" },
          { id: "thrown-empty" },
        ),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage([
      fauxText("TEST applied, refused, corrected, and thrown outcomes."),
    ]),
  ]);

  const application = await loadBuiltBrunchApplication();
  setProvider(faux.provider);
  const identity = {
    conversationId: `workpiece-refusal-${crypto.randomUUID()}`,
    principalKey: "workpiece-refusal-principal",
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
  const transport = createBrunchPanelTransport(
    Promise.resolve(client),
    tracker,
    {
      clientToolNames: new Set(),
      initialData: {
        mode: brunchModes.integrated,
        construction: {
          binding: {
            conversationId: identity.conversationId,
            documentId: "TEST-document",
            incarnationId: "TEST-incarnation",
          },
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
          id: "user-workpiece-refusal",
          parts: [
            { type: "text", text: "Settle, refuse, correct, then fail." },
          ],
          role: "user",
        },
      ],
      trigger: "submit-message",
    });
    const pendingById = new Map<string, PetrinautAiMessage>();
    let terminalMessage: PetrinautAiMessage | undefined;
    for await (const message of readUIMessageStream<PetrinautAiMessage>({
      stream,
    })) {
      terminalMessage = structuredClone(message);
      for (const part of message.parts) {
        if (
          !isToolUIPart(part) ||
          getToolName(part) !== "mutate_workpiece" ||
          (part.state !== "input-streaming" && part.state !== "input-available")
        ) {
          continue;
        }
        if (!pendingById.has(part.toolCallId)) {
          pendingById.set(part.toolCallId, structuredClone(message));
        }
      }
    }
    if (terminalMessage === undefined) {
      throw new Error("The UI stream produced no assistant message.");
    }

    for (const toolCallId of [
      "applied-first",
      "refused-shrink",
      "applied-second",
    ]) {
      const pending = pendingById.get(toolCallId);
      expect(pending, `pending row missing for ${toolCallId}`).toBeDefined();
      cleanup();
      renderAssistant([pending!]);
      const pendingRow = screen
        .getAllByRole("button")
        .find((row) => row.getAttribute("aria-busy") === "true");
      expect(pendingRow?.getAttribute("data-tone")).toBe("pending");
      expect(
        pendingRow?.querySelector("[data-tool-progress-spinner]"),
      ).not.toBeNull();
    }

    cleanup();
    renderAssistant([terminalMessage]);
    const appliedRows = screen.getAllByRole("button", {
      name: /Updated ledger/u,
    });
    expect(appliedRows).toHaveLength(2);
    expect(
      appliedRows.every((row) => row.getAttribute("data-tone") === "success"),
    ).toBe(true);
    expect(
      appliedRows.every(
        (row) =>
          row.querySelector('[data-tool-result-icon="complete"]') !== null,
      ),
    ).toBe(true);

    const refusedRow = screen.getByRole("button", {
      name: /Ledger update needs correction/u,
    });
    expect(refusedRow.getAttribute("data-tone")).toBe("neutral");
    expect(
      refusedRow.querySelector('[data-tool-result-icon="not-applied"]'),
    ).not.toBeNull();
    expect(within(refusedRow).queryByTestId("tool-detail")).toBeNull();
    fireEvent.click(refusedRow);
    expect(screen.getByText(/Nothing was written/u)).not.toBeNull();

    const thrownRow = screen.getByRole("button", {
      name: /Could not update ledger/u,
    });
    expect(thrownRow.getAttribute("data-tone")).toBe("danger");

    const history = await client.history();
    const canonicalIds = history.messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === "dynamic-tool" && part.toolName === "mutate_workpiece"
          ? [part.toolCallId]
          : [],
      ),
    );
    expect(canonicalIds).toEqual([
      "applied-first",
      "refused-shrink",
      "applied-second",
      "thrown-empty",
    ]);
    const refusedPart = history.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === "refused-shrink",
      );
    expect(refusedPart).toMatchObject({
      state: "output-available",
      output: { disposition: "refused", applied: false, code: "silent-shrink" },
    });
    const thrownPart = history.messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === "thrown-empty",
      );
    expect(thrownPart).toMatchObject({ state: "output-error" });

    const reopened = snapshotToUiMessages(history, {
      clientToolNames: new Set(),
    }) as PetrinautAiMessage[];
    cleanup();
    renderAssistant(reopened);
    expect(
      screen.getAllByRole("button", { name: /Updated ledger/u }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: /Ledger update needs correction/u }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Could not update ledger/u }),
    ).not.toBeNull();
  } finally {
    await client.abort().catch(() => undefined);
    await application.stop();
  }
}, 25_000);
