/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createPanelPresence } from "../../../../react/state/panel-presence";
import { PanelPresenceContext } from "../../../../react/state/panel-presence-context";
import { nextFrame } from "../../../lib/readings.test-helpers";
import { EditorResizers } from "./editor-resizers";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const assistantIsDisabled = () =>
  screen
    .getByRole("separator", { name: "Resize AI assistant" })
    .getAttribute("aria-disabled") === "true";

const docked = () =>
  createPanelPresence({
    open: {
      leftSidebar: true,
      propertiesPanel: false,
      bottomPanel: false,
      aiAssistant: true,
    },
    isAssistantDocked: true,
  });

it("resizes the assistant only while it is docked, in view and has the room beside the workspace", async () => {
  const presence = docked();
  render(
    <PanelPresenceContext value={presence}>
      <EditorResizers canvasShows />
    </PanelPresenceContext>,
  );
  expect(assistantIsDisabled()).toBe(false);

  presence.aiAssistantDocked.set(0);
  await nextFrame();
  expect(assistantIsDisabled()).toBe(true);

  presence.aiAssistantDocked.set(1);
  presence.aiAssistantHasRoom.set(0);
  await nextFrame();
  expect(assistantIsDisabled()).toBe(true);

  presence.aiAssistantHasRoom.set(1);
  await nextFrame();
  expect(assistantIsDisabled()).toBe(false);
});

it("holds the docked panels' separators only while the canvas shows", () => {
  const view = render(
    <PanelPresenceContext value={docked()}>
      <EditorResizers canvasShows={false} />
    </PanelPresenceContext>,
  );
  expect(screen.getAllByRole("separator")).toHaveLength(1);

  view.rerender(
    <PanelPresenceContext value={docked()}>
      <EditorResizers canvasShows />
    </PanelPresenceContext>,
  );
  expect(screen.getAllByRole("separator")).toHaveLength(4);
});
