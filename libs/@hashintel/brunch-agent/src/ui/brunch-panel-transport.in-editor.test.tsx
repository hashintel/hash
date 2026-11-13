/** @vitest-environment jsdom */
import { FlueApiError } from "@flue/sdk";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { Petrinaut } from "@hashintel/petrinaut/ui";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../client/brunch-panel-transport";
import { AiAssistantPanel } from "./chat/ai-assistant-panel";
import { pendingCommentsFor } from "./ledger/brunch-ledger-comments";
import { BrunchLedgerCommentsBar } from "./ledger/brunch-ledger-comments-bar";
import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadLanguageServer,
} from "./testing/petrinaut-jsdom";
import { BrunchExperimentFollowUp } from "./tools/brunch-experiment-follow-up";
import { editorDraftsFor } from "./tools/shared/brunch-draft-experiment-drafts";

import type { ConversationStreamChunk, FlueClient } from "@flue/sdk";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("./testing/petrinaut-jsdom");
  installPetrinautDomShims();
});
beforeAll(async () => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  await preloadLanguageServer();
}, 30_000);
afterEach(cleanup);

const HostAdmissionTestPlugin = definePetrinautPlugin({
  id: "test.host-admission",
  name: "Host admission",
  description: "Exercises real host sends.",
  author: "HASH",
  access: { document: "write", experiments: "write", editor: "write" },
  assistant: true,
});

test("real panel keeps rejected comments and preserves composer text, then clears at admission before a failed response", async () => {
  const response = Promise.withResolvers<void>();
  const send = vi
    .fn<FlueClient["send"]>()
    .mockRejectedValueOnce(new FlueApiError(403, "Refused"))
    .mockResolvedValue({
      submissionId: "admitted-comments",
      uid: "uid",
      offset: "offset",
      streamUrl: "http://brunch.test/stream",
    });
  const wait = vi.fn<FlueClient["wait"]>(() => response.promise);
  const tracker = new BrunchPanelConversationTracker();
  const transport = createBrunchPanelTransport(
    Promise.resolve({ send, wait } as unknown as FlueClient),
    tracker,
  );
  let chatMessages: readonly { id: string; role: string }[] = [];
  const useHostPlugin: PluginHook<typeof HostAdmissionTestPlugin> = (api) => ({
    assistant: {
      content: (
        <AiAssistantPanel
          api={api}
          aiAssistant={{
            conversationId: "comments",
            transport,
            renderComposerControl: (context) => {
              chatMessages = context.messages;
              return (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      pendingCommentsFor(
                        api.document.net,
                        context.conversationId,
                      ).add({ text: "Use nine agents", records: ["c1"] })
                    }
                  >
                    Queue comment
                  </button>
                  <BrunchLedgerCommentsBar
                    net={api.document.net}
                    context={{
                      ...context,
                      submitText: (input) =>
                        tracker.submitTextWithAdmission(
                          context.submitText,
                          input,
                        ),
                    }}
                  />
                </>
              );
            },
          }}
        />
      ),
    },
  });
  render(
    <Petrinaut
      handle={createJsonDocHandle({ initial: { places: [], transitions: [] } })}
      plugins={[HostAdmissionTestPlugin(useHostPlugin)]}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Show AI assistant" }),
  );
  const composer = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "Message AI assistant",
  });
  fireEvent.change(composer, { target: { value: "Unsent ordinary draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Queue comment" }));
  fireEvent.click(await screen.findByRole("button", { name: "Send" }));
  await screen.findByRole("button", { name: "Retry" });
  expect(send).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("group", { name: "Ledger comments" }).textContent,
  ).toContain("1 comment");
  expect(composer.value).toBe("Unsent ordinary draft");

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(screen.queryByRole("group", { name: "Ledger comments" })).toBeNull(),
  );
  expect(wait).toHaveBeenCalledOnce();
  expect(composer.value).toBe("Unsent ordinary draft");
  await act(async () =>
    response.reject(new Error("Response failed after admission")),
  );
  await screen.findByText("Response failed after admission");
  expect(screen.queryByRole("group", { name: "Ledger comments" })).toBeNull();
  expect(send).toHaveBeenCalledTimes(2);
  // Let the panel's 80ms message throttle publish the settled transcript.
  await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
  // Retry sends under a fresh identity, so the refused copy must be gone.
  const userMessageIds = chatMessages
    .filter(({ role }) => role === "user")
    .map(({ id }) => id);
  expect(userMessageIds).toHaveLength(1);
  expect(send.mock.calls[1]?.[0].idempotencyKey).toBe(
    `ai-sdk:signal:${userMessageIds[0]}`,
  );
});

test.each([
  {
    failure: "a definite refusal removes",
    error: new FlueApiError(403, "Refused"),
    kept: 0,
  },
  {
    failure: "an ambiguous failure keeps",
    error: new TypeError("Connection lost after request write"),
    kept: 1,
  },
])(
  "real panel: $failure the optimistic composer message",
  async ({ error, kept }) => {
    const send = vi.fn<FlueClient["send"]>().mockRejectedValue(error);
    const transport = createBrunchPanelTransport(
      Promise.resolve({ send } as unknown as FlueClient),
      new BrunchPanelConversationTracker(),
    );
    let userMessages = 0;
    // Declared outside the plugin hook so the compiler keeps its closure.
    const renderComposerControl = (context: {
      messages: readonly { role: string }[];
    }) => {
      userMessages = context.messages.filter(
        ({ role }) => role === "user",
      ).length;
      return null;
    };
    const useHostPlugin: PluginHook<typeof HostAdmissionTestPlugin> = (
      api,
    ) => ({
      assistant: {
        content: (
          <AiAssistantPanel
            api={api}
            aiAssistant={{
              conversationId: "composer",
              transport,
              renderComposerControl,
            }}
          />
        ),
      },
    });
    render(
      <Petrinaut
        handle={createJsonDocHandle({
          initial: { places: [], transitions: [] },
        })}
        plugins={[HostAdmissionTestPlugin(useHostPlugin)]}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Show AI assistant" }),
    );
    const composer = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(composer, { target: { value: "Hello Brunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(composer.value).toBe("Hello Brunch"));
    // Let the panel's 80ms message throttle publish the settled transcript.
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(send).toHaveBeenCalledOnce();
    expect(userMessages).toBe(kept);
  },
);

/** Flue's wire for one turn that ends on a recorded `ledger_commit`, with reply text before it when given. */
const commitTurnEvents = (
  replyText: string | undefined,
): ConversationStreamChunk[] => {
  const at = (batch: number) => ({
    conversationId: "conv-commit",
    position: { batch, index: 0 },
  });
  const messageId = "entry-commit";
  return [
    {
      ...at(1),
      type: "message-started",
      messageId,
      submissionId: "admitted-commit",
      turnId: "turn-commit",
      timestamp: "2026-11-13T00:00:00.000Z",
    },
    ...(replyText === undefined
      ? []
      : [
          {
            ...at(2),
            type: "message-delta" as const,
            messageId,
            kind: "text" as const,
            delta: replyText,
          },
        ]),
    {
      ...at(3),
      type: "tool-input",
      messageId,
      toolCallId: "commit-1",
      toolName: "ledger_commit",
      input: { entries: [], endTurn: true },
    },
    {
      ...at(4),
      type: "message-completed",
      messageId,
      timestamp: "2026-11-13T00:00:01.000Z",
    },
    {
      ...at(5),
      type: "tool-output",
      toolCallId: "commit-1",
      output: { status: "recorded", commitId: "commit-1", revision: 1 },
      durationMs: 1,
      timestamp: "2026-11-13T00:00:02.000Z",
    },
    {
      ...at(6),
      type: "submission-settled",
      submissionId: "admitted-commit",
      outcome: "completed",
      answeredBySubmissionId: "admitted-commit",
      timestamp: "2026-11-13T00:00:03.000Z",
    },
  ];
};

test.each([
  {
    turn: "reply text before the commit",
    replyText: "Recorded the reservoir.",
    notes: 0,
  },
  { turn: "no reply text", replyText: undefined, notes: 1 },
])(
  "real panel: a turn ending on a Ledger commit with $turn shows $notes no-reply notes",
  async ({ replyText, notes }) => {
    const send = vi.fn<FlueClient["send"]>().mockResolvedValue({
      submissionId: "admitted-commit",
      uid: "uid",
      offset: "offset",
      streamUrl: "http://brunch.test/stream",
    });
    const wait = vi.fn<FlueClient["wait"]>(async (_admission, options) => {
      for (const event of commitTurnEvents(replyText))
        await options?.onEvent?.(event);
    });
    const transport = createBrunchPanelTransport(
      Promise.resolve({ send, wait } as unknown as FlueClient),
      new BrunchPanelConversationTracker(),
    );
    const useHostPlugin: PluginHook<typeof HostAdmissionTestPlugin> = (
      api,
    ) => ({
      assistant: {
        content: (
          <AiAssistantPanel
            api={api}
            aiAssistant={{ conversationId: "commit", transport }}
          />
        ),
      },
    });
    render(
      <Petrinaut
        handle={createJsonDocHandle({
          initial: { places: [], transitions: [] },
        })}
        plugins={[HostAdmissionTestPlugin(useHostPlugin)]}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Show AI assistant" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Message AI assistant" }),
      { target: { value: "The reservoir is slow." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(wait).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Stop AI response" }),
      ).toBeNull(),
    );
    // Let the panel's 80ms message throttle publish the settled transcript.
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    if (replyText !== undefined) screen.getByText(replyText);
    expect(screen.queryAllByText("No reply received")).toHaveLength(notes);
    expect(send).toHaveBeenCalledOnce();
  },
);

test("real panel offers experiment delivery retry after ambiguous admission and never retries an admitted response failure", async () => {
  const response = Promise.withResolvers<void>();
  const send = vi
    .fn<FlueClient["send"]>()
    .mockRejectedValueOnce(new TypeError("Connection lost after request write"))
    .mockResolvedValue({
      submissionId: "admitted-result",
      uid: "uid",
      offset: "offset",
      streamUrl: "http://brunch.test/stream",
    });
  const wait = vi.fn<FlueClient["wait"]>(() => response.promise);
  const tracker = new BrunchPanelConversationTracker();
  const transport = createBrunchPanelTransport(
    Promise.resolve({ send, wait } as unknown as FlueClient),
    tracker,
  );
  let chatMessages: readonly { id: string; role: string }[] = [];
  const useHostPlugin: PluginHook<typeof HostAdmissionTestPlugin> = (api) => ({
    assistant: {
      content: (
        <AiAssistantPanel
          api={api}
          aiAssistant={{
            conversationId: "experiment",
            transport,
            messages: [
              {
                id: "draft",
                role: "assistant",
                parts: [
                  {
                    type: "dynamic-tool",
                    toolName: "draft_petrinaut_experiment",
                    toolCallId: "result-tool",
                    state: "output-available",
                    input: {},
                    output: {},
                  },
                ],
              },
            ],
            renderComposerControl: (context) => {
              chatMessages = context.messages;
              return (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      editorDraftsFor(api.document.net).register({
                        toolCallId: "result-tool",
                        dismissed: false,
                        prepared: null,
                        invalid: null,
                        definition: {
                          places: [],
                          transitions: [],
                          types: [],
                          parameters: [],
                          differentialEquations: [],
                        },
                        input: {
                          experiment: {
                            name: "Run",
                            scenarioId: "scenario",
                            runCount: 1,
                            seed: 1,
                            dt: 1,
                            maxTime: 1,
                            metricIds: [],
                            scenarioParameterValues: {},
                            execution: { mode: "simulate" },
                          },
                          declarations: [],
                          unsupported: [],
                        },
                        run: {
                          phase: "finished",
                          result: {
                            status: "complete",
                            experimentId: "experiment",
                            name: "Run",
                            runsCompleted: 1,
                            metrics: [],
                          },
                        },
                      })
                    }
                  >
                    Finish experiment
                  </button>
                  <BrunchExperimentFollowUp
                    net={api.document.net}
                    context={{
                      ...context,
                      submitText: (input) =>
                        tracker.submitTextWithAdmission(
                          context.submitText,
                          input,
                        ),
                    }}
                  />
                </>
              );
            },
          }}
        />
      ),
    },
  });
  render(
    <Petrinaut
      handle={createJsonDocHandle({ initial: { places: [], transitions: [] } })}
      plugins={[HostAdmissionTestPlugin(useHostPlugin)]}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Show AI assistant" }),
  );
  const composer = screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "Message AI assistant",
  });
  fireEvent.change(composer, { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Finish experiment" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry result summary" }),
  );
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Retry result summary" }),
    ).toBeNull(),
  );
  expect(send.mock.calls[0]?.[0].idempotencyKey).toBe(
    send.mock.calls[1]?.[0].idempotencyKey,
  );
  expect(send.mock.calls[0]?.[0].message).toEqual(
    send.mock.calls[1]?.[0].message,
  );
  expect(composer.value).toBe("Keep this draft");
  await act(async () =>
    response.reject(new Error("Experiment response failed after admission")),
  );
  await screen.findByText("Experiment response failed after admission");
  // Let the panel's 80ms message throttle publish the settled transcript.
  await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
  // The retry replaced its unconfirmed local copy instead of adding a second.
  expect(
    chatMessages
      .filter(({ role }) => role === "user")
      .map(({ id }) => `ai-sdk:user:${id}`),
  ).toEqual([send.mock.calls[1]?.[0].idempotencyKey]);
  expect(
    screen.queryByRole("button", { name: "Retry result summary" }),
  ).toBeNull();
  expect(send).toHaveBeenCalledTimes(2);
});
