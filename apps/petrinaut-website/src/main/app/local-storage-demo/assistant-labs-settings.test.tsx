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
  selectAssistant: vi.fn(),
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
