/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  render as renderWithoutPanel,
  screen,
  within,
} from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import {
  createTestEditorApi,
  TestEditorApi,
} from "../../testing/create-test-editor-api";
import { TestAssistantPanel } from "../../testing/test-assistant-panel";
import { VoiceSessionContext } from "../../voice-session/context";
import { createVoiceSessionStore } from "../../voice-session/store";
import { AiAssistantContents } from "../ai-assistant-contents";

import type { PetrinautAiMessage } from "../types";

vi.mock("@hashintel/petrinaut/ui/plugin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hashintel/petrinaut/ui/plugin")>()),
  ...(await import("../../testing/test-assistant-panel")).assistantPanelMocks,
}));

const noop = () => {};

const ChatFrame = ({ children }: { children: ReactNode }) => (
  <TestEditorApi api={createTestEditorApi()}>
    <TestAssistantPanel>{children}</TestAssistantPanel>
  </TestEditorApi>
);

// The Voice ribbon asks for a 2D context on mount; jsdom has none.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    },
  );
});

afterEach(cleanup);

const questions = [
  {
    kind: "choose",
    label: "Quarantined shipment",
    text: "When a shipment is quarantined, how is it counted until quality releases it?",
    options: [
      { label: "Stays open", value: "It stays counted as an open order" },
      { label: "Drops out", value: "It drops out until quality releases it" },
      { label: "Scrapped" },
    ],
  },
  {
    kind: "values",
    label: "Reorder points",
    text: "What are the two reorder points?",
    fields: [
      { label: "Lower reorder point", unit: "units" },
      { label: "Lead time" },
    ],
  },
  {
    kind: "open",
    label: "Recent order",
    text: "Can you walk me through one recent order?",
  },
  {
    kind: "confirm",
    label: "Production demand",
    text: "Does production demand drive the reorder?",
  },
];

const opening: PetrinautAiMessage = {
  id: "opening",
  role: "user",
  parts: [{ type: "text", text: "We quarantine Flowbind on arrival." }],
};

const asking: PetrinautAiMessage = {
  id: "asking",
  role: "assistant",
  parts: [
    { type: "text", text: "A few things to check." },
    {
      type: "dynamic-tool",
      toolName: "offer_answers",
      toolCallId: "offer-1",
      state: "output-available",
      input: { questions },
      output: { offered: questions.length },
    },
  ],
};

type ContentsProps = Parameters<typeof AiAssistantContents>[0];

const renderVoice = (props: Partial<ContentsProps> = {}) => {
  const store = createVoiceSessionStore();
  store.setActions({ end: noop, pause: noop });
  store.setState({
    errorMessage: null,
    microphoneLevel: 0,
    microphoneMuted: false,
    phase: "listening",
  });
  return renderWithoutPanel(
    <VoiceSessionContext.Provider value={store}>
      <AiAssistantContents
        input=""
        inputMode="voice"
        messages={[opening, asking]}
        onInputChange={noop}
        onSendAnswer={noop}
        onStop={noop}
        onSubmit={noop}
        status="ready"
        {...props}
      />
    </VoiceSessionContext.Provider>,
    { wrapper: ChatFrame },
  );
};

const voiceQuestions = () =>
  screen.queryByRole("region", { name: "Questions to answer aloud" });

describe("Brunch's questions in Voice", () => {
  test("show every question in full, in order, read-only above the Voice controls", () => {
    renderVoice();
    const region = voiceQuestions();
    expect(region).not.toBeNull();
    const panel = within(region as HTMLElement);

    const items = panel
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.tagName === "OL");
    expect(items.map((item) => item.querySelector("h3")?.textContent)).toEqual([
      "Quarantined shipment",
      "Reorder points",
      "Recent order",
      "Production demand",
    ]);
    for (const { text } of questions)
      expect(panel.getByText(text)).not.toBeNull();

    const [choose, values, , confirm] = items.map((item) => within(item));
    expect(
      choose!.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Stays open: It stays counted as an open order",
      "Drops out: It drops out until quality releases it",
      "Scrapped",
    ]);
    expect(
      values!.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Lower reorder point (units)", "Lead time"]);
    expect(
      confirm!.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Yes"]);

    expect(panel.queryAllByRole("button")).toEqual([]);
    expect(panel.queryAllByRole("textbox")).toEqual([]);
    expect(
      screen.queryByRole("region", { name: "Brunch's questions" }),
    ).toBeNull();

    const endVoice = screen.getByRole("button", { name: "End voice mode" });
    const inOrder = [...document.querySelectorAll("section, button")].filter(
      (element) => element === region || element === endVoice,
    );
    expect(inOrder, "The questions sit above the Voice controls.").toEqual([
      region,
      endVoice,
    ]);
  });

  test.each([
    ["in Chat", { inputMode: "text" as const }],
    ["while Brunch is busy", { status: "streaming" as const }],
    ["after the turn was stopped", { stopped: true }],
    ["while handing off to Voice", { voiceHandoffPending: true }],
    [
      "when the reply asking failed",
      {
        messages: [opening, { ...asking, metadata: { failed: true as const } }],
      },
    ],
    [
      "when a later reply failed",
      {
        messages: [
          opening,
          asking,
          {
            id: "failed",
            role: "assistant" as const,
            metadata: { failed: true as const },
            parts: [{ type: "text" as const, text: "Something went wrong." }],
          },
        ],
      },
    ],
    [
      "once the person has answered",
      {
        messages: [
          opening,
          asking,
          {
            id: "answered",
            role: "user" as const,
            parts: [{ type: "text" as const, text: "It drops out." }],
          },
        ],
      },
    ],
  ] satisfies [string, Partial<ContentsProps>][])(
    "are absent %s",
    (_name, props) => {
      renderVoice(props);
      expect(voiceQuestions()).toBeNull();
    },
  );
});
