/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AssistantLabsSettings } from "./assistant-labs-settings";

import type { ComponentProps } from "react";

const voiceConfig = {
  available: true,
  connectionTimeoutMs: 10_000,
} as const;

const defaultProps = {
  brunchActive: false,
  interviewBudgetEnabled: false,
  interviewBudgetPreferenceReady: true,
  openAIVoiceConfig: voiceConfig,
  realtimeEnabled: false,
  realtimePreferenceReady: true,
  setInterviewBudgetEnabled: vi.fn(),
  setRealtimeEnabled: vi.fn(),
  setVoiceEnabled: vi.fn(),
  voiceEnabled: false,
  voicePreferenceReady: true,
  wordsEnabled: false,
  wordsPreferenceReady: true,
  setWordsEnabled: vi.fn(),
} satisfies ComponentProps<typeof AssistantLabsSettings>;

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("enables Voice only for the shown Brunch, and explains when Voice is unavailable", async () => {
  const setVoiceEnabled = vi.fn();
  const props = { ...defaultProps, setVoiceEnabled };
  const view = render(<AssistantLabsSettings {...props} />);

  expect(screen.queryByRole("checkbox", { name: "Use Brunch" })).toBeNull();
  expect(screen.getByRole("checkbox", { name: "Enable Voice" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(
    screen.getByText(
      "Choose Brunch in General › AI assistant to enable Voice.",
    ),
  ).toBeDefined();

  view.rerender(<AssistantLabsSettings {...props} brunchActive />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Enable Voice" }));
  await waitFor(() => expect(setVoiceEnabled).toHaveBeenCalledWith(true));

  view.rerender(<AssistantLabsSettings {...props} brunchActive={false} />);
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Enable Voice",
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);

  view.rerender(
    <AssistantLabsSettings {...props} brunchActive openAIVoiceConfig={null} />,
  );
  expect(
    screen.getByText("Voice is unavailable in this deployment."),
  ).toBeDefined();
});

test("shows Interview length only within Brunch and waits for its preference", async () => {
  const view = render(<AssistantLabsSettings {...defaultProps} />);
  expect(
    screen.queryByRole("checkbox", { name: "Interview length" }),
  ).toBeNull();
  view.rerender(
    <AssistantLabsSettings
      {...defaultProps}
      brunchActive
      interviewBudgetPreferenceReady={false}
    />,
  );
  expect(
    screen.getByRole("checkbox", { name: "Interview length" }),
  ).toHaveProperty("disabled", true);
  view.rerender(<AssistantLabsSettings {...defaultProps} brunchActive />);
  const toggle = screen.getByRole("checkbox", { name: "Interview length" });
  expect(toggle).toHaveProperty("checked", false);
  expect(toggle).toHaveProperty("disabled", false);
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(defaultProps.setInterviewBudgetEnabled).toHaveBeenCalledWith(true),
  );
});

test("shows Realtime only for enabled Brunch Voice and waits for capability", async () => {
  const view = render(<AssistantLabsSettings {...defaultProps} voiceEnabled />);
  expect(screen.queryByRole("checkbox", { name: "Realtime mode" })).toBeNull();
  view.rerender(<AssistantLabsSettings {...defaultProps} brunchActive />);
  expect(screen.queryByRole("checkbox", { name: "Realtime mode" })).toBeNull();

  for (const capability of [undefined, null]) {
    view.rerender(
      <AssistantLabsSettings
        {...defaultProps}
        brunchActive
        voiceEnabled
        openAIVoiceConfig={capability}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Realtime mode" }),
    ).toHaveProperty("disabled", true);
  }
  view.rerender(
    <AssistantLabsSettings {...defaultProps} brunchActive voiceEnabled />,
  );
  const toggle = screen.getByRole("checkbox", { name: "Realtime mode" });
  expect(toggle).toHaveProperty("checked", false);
  expect(toggle).toHaveProperty("disabled", false);
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(defaultProps.setRealtimeEnabled).toHaveBeenCalledWith(true),
  );
});

test.each([
  {
    name: "Voice preference loading",
    props: { brunchActive: true, voicePreferenceReady: false },
    control: "Enable Voice",
    checked: false,
    description: "Loading your Voice preference…",
  },
  {
    name: "Voice capability loading",
    props: { brunchActive: true, openAIVoiceConfig: undefined },
    control: "Enable Voice",
    checked: false,
    description: "Checking whether Voice is available…",
  },
])(
  "disables controls during $name",
  ({ props, control, checked, description }) => {
    render(<AssistantLabsSettings {...defaultProps} {...props} />);

    const toggle = screen.getByRole("checkbox", { name: control });
    expect(toggle).toHaveProperty("checked", checked);
    expect(toggle).toHaveProperty("disabled", true);
    expect(screen.getByText(description)).toBeDefined();
  },
);
