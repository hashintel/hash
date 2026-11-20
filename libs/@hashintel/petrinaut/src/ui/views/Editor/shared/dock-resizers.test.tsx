/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createPanelPresence } from "../../../../react/state/panel-presence";
import { PanelPresenceContext } from "../../../../react/state/panel-presence-context";
import { nextFrame } from "../../../lib/readings.test-helpers";
import { DockResizers } from "./dock-resizers";

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

const isDisabled = (name: string) =>
  screen.getByRole("separator", { name }).getAttribute("aria-disabled") ===
  "true";

it("has a separator for each docked panel, and only an open panel's resizes", () => {
  const presence = createPanelPresence({
    open: {
      leftSidebar: true,
      propertiesPanel: false,
      bottomPanel: true,
      aiAssistant: false,
    },
    isAssistantDocked: true,
  });
  render(
    <PanelPresenceContext value={presence}>
      <DockResizers />
    </PanelPresenceContext>,
  );

  expect(isDisabled("Resize the left sidebar")).toBe(false);
  expect(isDisabled("Resize the properties panel")).toBe(true);
  expect(isDisabled("Resize the bottom panel")).toBe(false);
});

it("stops resizing a panel as soon as it starts to slide out, and resumes once it is back", async () => {
  const presence = createPanelPresence({
    open: {
      leftSidebar: true,
      propertiesPanel: false,
      bottomPanel: false,
      aiAssistant: false,
    },
    isAssistantDocked: true,
  });
  render(
    <PanelPresenceContext value={presence}>
      <DockResizers />
    </PanelPresenceContext>,
  );

  presence.shown.leftSidebar.set(0.8);
  await nextFrame();
  expect(isDisabled("Resize the left sidebar")).toBe(true);

  presence.shown.leftSidebar.set(1);
  await nextFrame();
  expect(isDisabled("Resize the left sidebar")).toBe(false);
});
