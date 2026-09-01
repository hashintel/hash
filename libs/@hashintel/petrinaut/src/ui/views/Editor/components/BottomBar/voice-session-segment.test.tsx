/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { VoiceSessionContext } from "../../../../../react/voice-session/context";
import { createVoiceSessionStore } from "../../../../../react/voice-session/store";
import { VoiceSessionSegment } from "./voice-session-segment";

import type { VoiceSessionStore } from "../../../../../react/voice-session/store";
import type { PetrinautAiVoiceSessionPhase } from "../../../../types/ai-assistant-composer-control";

const storeWithActions = () => {
  const actions = {
    end: vi.fn(),
    pause: vi.fn(),
    reconnect: vi.fn(),
    resume: vi.fn(),
  };
  const store = createVoiceSessionStore();
  store.setActions(actions);

  return { actions, store };
};

const renderSegment = (
  store: VoiceSessionStore,
  phase: PetrinautAiVoiceSessionPhase,
) =>
  render(
    <VoiceSessionContext.Provider value={store}>
      <VoiceSessionSegment phase={phase} />
    </VoiceSessionContext.Provider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VoiceSessionSegment", () => {
  test("ends and pauses a running session from the toolbar", () => {
    const { actions, store } = storeWithActions();
    renderSegment(store, "listening");

    expect(screen.getByText("Listening")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pause voice mode" }));
    fireEvent.click(screen.getByRole("button", { name: "End voice mode" }));

    expect(actions.pause).toHaveBeenCalledOnce();
    expect(actions.end).toHaveBeenCalledOnce();
  });

  test("offers resume while paused and reconnect after a failure", () => {
    const { actions, store } = storeWithActions();
    const { unmount } = renderSegment(store, "paused");

    fireEvent.click(screen.getByRole("button", { name: "Resume voice mode" }));
    expect(actions.resume).toHaveBeenCalledOnce();
    unmount();

    renderSegment(store, "error");
    expect(screen.getByText("Voice interrupted")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Reconnect voice mode" }),
    );
    expect(actions.reconnect).toHaveBeenCalledOnce();
  });

  test("claims the session's controls only while it is mounted", () => {
    const { store } = storeWithActions();
    const { unmount } = renderSegment(store, "listening");

    expect(store.getSnapshot().hasCanvasControls).toBe(true);

    unmount();
    expect(store.getSnapshot().hasCanvasControls).toBe(false);
  });

  test("renders nothing before the host registers its controls", () => {
    const store = createVoiceSessionStore();
    renderSegment(store, "listening");

    expect(screen.queryByTestId("voice-session-segment")).toBeNull();
  });
});
