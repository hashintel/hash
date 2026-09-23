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

import { BrunchVoiceSetting } from "./brunch-voice-setting";

import type { ComponentProps } from "react";

const voiceConfig = {
  available: true,
  connectionTimeoutMs: 10_000,
} as const;

const defaultProps = {
  brunchActive: true,
  openAIVoiceConfig: voiceConfig,
  setVoiceEnabled: vi.fn(),
  voiceEnabled: false,
  voicePreferenceReady: true,
} satisfies ComponentProps<typeof BrunchVoiceSetting>;

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("enables Voice while Brunch is active, and explains when it is unavailable", async () => {
  const setVoiceEnabled = vi.fn();
  const props = { ...defaultProps, setVoiceEnabled };
  const view = render(<BrunchVoiceSetting {...props} />);

  fireEvent.click(screen.getByRole("checkbox", { name: "Enable Voice" }));
  await waitFor(() => expect(setVoiceEnabled).toHaveBeenCalledWith(true));

  view.rerender(<BrunchVoiceSetting {...props} openAIVoiceConfig={null} />);
  expect(
    screen.getByText("Voice is unavailable in this deployment."),
  ).toBeDefined();
});

test.each([
  {
    name: "another assistant active",
    props: { brunchActive: false },
    description: "Select Brunch to enable Voice.",
  },
  {
    name: "Voice preference loading",
    props: { voicePreferenceReady: false },
    description: "Loading your Voice preference…",
  },
  {
    name: "Voice capability loading",
    props: { openAIVoiceConfig: undefined },
    description: "Checking whether Voice is available…",
  },
])("disables Voice during $name", ({ props, description }) => {
  render(<BrunchVoiceSetting {...defaultProps} {...props} />);

  const toggle = screen.getByRole("checkbox", { name: "Enable Voice" });
  expect(toggle).toHaveProperty("checked", false);
  expect(toggle).toHaveProperty("disabled", true);
  expect(screen.getByText(description)).toBeDefined();
});
