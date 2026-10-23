/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import { brunchPlugin, BrunchAssistantContext } from "../editor-api-plugin";
import {
  InProcessLspWorker,
  NoopResizeObserver,
} from "../testing/petrinaut-jsdom";
import { createBrunchDraftExperimentInteractiveTool } from "./brunch-draft-experiment-interactive-tool";

import type { createInBandBrowserCalls } from "../../client/tools/in-band-browser-call";
import type { PetrinautAiMessage } from "../chat/ai-assistant-panel";
import type { PetrinautAiAssistant } from "../chat/petrinaut";
import type { DraftPetrinautExperimentInput } from "@hashintel/brunch-agent";
import type { UIMessageChunk } from "ai";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../testing/petrinaut-jsdom");
  installPetrinautDomShims();
});

beforeAll(async () => {
  // Settle the editor's import and theme setup before mounting.
  const monaco = await import("monaco-editor");
  monaco.editor.setTheme("vs");
}, 30_000);

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const draftInput: DraftPetrinautExperimentInput = {
  experiment: {
    name: "Staffing under peak demand",
    scenarioId: "scenario__peak_demand",
    scenarioParameterValues: { agents: { mode: "range", min: 2, max: 8 } },
    runCount: 20,
    seed: 7,
    dt: 1,
    maxTime: 120,
    metricIds: ["metric__average_waiting_time"],
    execution: {
      mode: "optimize",
      objectiveMetricId: "metric__average_waiting_time",
      direction: "minimize",
      steps: 3,
      runsPerStep: 5,
    },
  },
  declarations: [
    {
      subject: "maxTime",
      statement: "Minutes; the two-hour peak window is 120 minutes.",
    },
  ],
  unsupported: [],
};

// Another panel's turn, as this panel hydrates it from the conversation's
// history: a draft the other panel's stream delivered and hasn't settled.
const anotherPanelsPendingDraft: PetrinautAiMessage = {
  id: "assistant-other-panel",
  role: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: brunchTools.draftPetrinautExperiment,
      toolCallId: "draft-other-panel",
      state: "input-available",
      input: draftInput,
    },
  ],
};

/**
 * Opens the real editor's assistant with Brunch's draft card registered over
 * a `claim` spy, and Brunch's history passed as followed messages, as
 * `useBrunchAssistant` passes it.
 */
const openDraftPanel = async ({
  messages = [],
  sendMessages = () => Promise.resolve(new ReadableStream<UIMessageChunk>()),
}: {
  messages?: PetrinautAiMessage[];
  sendMessages?: PetrinautAiAssistant["transport"]["sendMessages"];
}) => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  const claim = vi.fn<ReturnType<typeof createInBandBrowserCalls>["claim"]>(
    () => new Promise(() => {}),
  );
  const handle = createJsonDocHandle({
    initial: { places: [], transitions: [] },
  });
  const aiAssistant: PetrinautAiAssistant = {
    interactiveTools: [
      createBrunchDraftExperimentInteractiveTool({
        browserCalls: { claim } as unknown as ReturnType<
          typeof createInBandBrowserCalls
        >,
        readTitle: () => "Support desk",
        handle,
        readDraftAuthority: async () => "revision",
      }),
    ],
    messages,
    followMessages: { canReplace: () => true },
    transport: { reconnectToStream: () => Promise.resolve(null), sendMessages },
  };
  render(
    <ErrorTrackerContext value={{ captureException: vi.fn() }}>
      <BrunchAssistantContext value={aiAssistant}>
        <Petrinaut handle={handle} plugins={[brunchPlugin]} />
      </BrunchAssistantContext>
    </ErrorTrackerContext>,
  );
  await act(async () =>
    fireEvent.click(
      await screen.findByRole("button", { name: "Show AI assistant" }),
    ),
  );
  return { claim };
};

const renderedCall = (toolCallId: string) =>
  document.querySelector(`[data-tool-call-id="${toolCallId}"]`);

test("a hydrated draft that another panel's stream delivered is never claimed here (U12)", async () => {
  const { claim } = await openDraftPanel({
    messages: [anotherPanelsPendingDraft],
  });
  // The card renders here: only its claim is withheld.
  await vi.waitFor(() =>
    expect(renderedCall("draft-other-panel")).not.toBeNull(),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(claim).not.toHaveBeenCalled();
});

test("a draft this panel's stream delivers is claimed here", async () => {
  const { claim } = await openDraftPanel({
    sendMessages: () =>
      Promise.resolve(
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            for (const chunk of [
              { type: "start" },
              { type: "start-step" },
              {
                type: "tool-input-available",
                dynamic: true,
                toolCallId: "draft-this-panel",
                toolName: brunchTools.draftPetrinautExperiment,
                input: draftInput,
              },
              { type: "finish-step" },
              { type: "finish" },
            ] satisfies UIMessageChunk[])
              controller.enqueue(chunk);
            controller.close();
          },
        }),
      ),
  });
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Message AI assistant" }),
    { target: { value: "Draft the staffing experiment." } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await vi.waitFor(() =>
    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: "draft-this-panel" }),
    ),
  );
});
