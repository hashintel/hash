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
  assistantReady: true,
  brunchConfigured: true,
  brunchSelected: false,
  forceBrunch: false,
  openAIVoiceConfig: voiceConfig,
  realtimeEnabled: false,
  realtimePreferenceReady: true,
  selectAssistant: vi.fn(),
  setRealtimeEnabled: vi.fn(),
  setVoiceEnabled: vi.fn(),
  voiceEnabled: false,
  voicePreferenceReady: true,
} satisfies ComponentProps<typeof AssistantLabsSettings>;

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("selects Brunch, enables Voice, and explains when Voice is unavailable", async () => {
  const selectAssistant = vi.fn();
  const setVoiceEnabled = vi.fn();
  const props = { ...defaultProps, selectAssistant, setVoiceEnabled };
  const view = render(<AssistantLabsSettings {...props} />);

  const brunchToggle = screen.getByRole("checkbox", { name: "Use Brunch" });
  const voiceToggle = screen.getByRole("checkbox", { name: "Enable Voice" });
  expect(brunchToggle).toBeDefined();
  expect(voiceToggle).toBeDefined();

  fireEvent.click(brunchToggle);
  expect((brunchToggle as HTMLInputElement).checked).toBe(true);
  await waitFor(() => expect(selectAssistant).toHaveBeenCalledWith("brunch"));

  view.rerender(<AssistantLabsSettings {...props} brunchSelected />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Enable Voice" }));
  await waitFor(() => expect(setVoiceEnabled).toHaveBeenCalledWith(true));

  view.rerender(<AssistantLabsSettings {...props} brunchSelected={false} />);
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Enable Voice",
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);

  view.rerender(
    <AssistantLabsSettings
      {...props}
      brunchSelected
      openAIVoiceConfig={null}
    />,
  );
  expect(
    screen.getByText("Voice is unavailable in this deployment."),
  ).toBeDefined();
});

test("shows Realtime only for enabled Brunch Voice and waits for capability", async () => {
  const view = render(<AssistantLabsSettings {...defaultProps} voiceEnabled />);
  expect(screen.queryByRole("checkbox", { name: "Realtime mode" })).toBeNull();
  view.rerender(<AssistantLabsSettings {...defaultProps} brunchSelected />);
  expect(screen.queryByRole("checkbox", { name: "Realtime mode" })).toBeNull();

  for (const capability of [undefined, null]) {
    view.rerender(
      <AssistantLabsSettings
        {...defaultProps}
        brunchSelected
        voiceEnabled
        openAIVoiceConfig={capability}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Realtime mode" }),
    ).toHaveProperty("disabled", true);
  }
  view.rerender(
    <AssistantLabsSettings {...defaultProps} brunchSelected voiceEnabled />,
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
    name: "assistant preference loading",
    props: { assistantReady: false },
    control: "Use Brunch",
    checked: false,
    description: "Loading your assistant preference…",
  },
  {
    name: "missing Brunch configuration",
    props: { brunchConfigured: false },
    control: "Use Brunch",
    checked: false,
    description:
      "Brunch is unavailable because this site has no Brunch endpoint configured.",
  },
  {
    name: "forced Brunch",
    props: { brunchSelected: true, forceBrunch: true },
    control: "Use Brunch",
    checked: true,
    description: "This document requires Brunch.",
  },
  {
    name: "Voice preference loading",
    props: { brunchSelected: true, voicePreferenceReady: false },
    control: "Enable Voice",
    checked: false,
    description: "Loading your Voice preference…",
  },
  {
    name: "Voice capability loading",
    props: { brunchSelected: true, openAIVoiceConfig: undefined },
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
