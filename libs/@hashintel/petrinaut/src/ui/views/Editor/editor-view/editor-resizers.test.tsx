/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createPanelPresence } from "../../../../react/state/panel-presence";
import { PanelPresenceContext } from "../../../../react/state/panel-presence-context";
import { nextFrame } from "../../../lib/readings.test-helpers";
import { EditorResizers } from "./editor-resizers";

import type { DockName } from "../shared/docks";

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

/** The editor's resizers with the named panels open and the assistant docked, open or not. */
const renderResizers = ({
  open = [],
  assistant = false,
  canvasShows = true,
}: {
  open?: DockName[];
  assistant?: boolean;
  canvasShows?: boolean;
} = {}) => {
  const presence = createPanelPresence({
    open: {
      leftSidebar: open.includes("leftSidebar"),
      propertiesPanel: open.includes("propertiesPanel"),
      bottomPanel: open.includes("bottomPanel"),
      aiAssistant: assistant,
    },
    isAssistantDocked: true,
  });
  const resizers = (shows: boolean) => (
    <PanelPresenceContext value={presence}>
      <EditorResizers canvasShows={shows} />
    </PanelPresenceContext>
  );
  const view = render(resizers(canvasShows));

  return {
    presence,
    showCanvas: (shows: boolean) => view.rerender(resizers(shows)),
  };
};

const isDisabled = (name: string) =>
  screen.getByRole("separator", { name }).getAttribute("aria-disabled") ===
  "true";

it("has a separator for each docked panel, and only an open panel's resizes", () => {
  renderResizers({ open: ["leftSidebar", "bottomPanel"] });

  expect(isDisabled("Resize the left sidebar")).toBe(false);
  expect(isDisabled("Resize the properties panel")).toBe(true);
  expect(isDisabled("Resize the bottom panel")).toBe(false);
});

it("stops resizing a panel as soon as it starts to slide out, and resumes once it is back", async () => {
  const { presence } = renderResizers({ open: ["leftSidebar"] });

  presence.shown.leftSidebar.set(0.8);
  await nextFrame();
  expect(isDisabled("Resize the left sidebar")).toBe(true);

  presence.shown.leftSidebar.set(1);
  await nextFrame();
  expect(isDisabled("Resize the left sidebar")).toBe(false);
});

it("resizes the assistant only while it is docked, in view and has the room beside the workspace", async () => {
  const { presence } = renderResizers({ assistant: true });
  expect(isDisabled("Resize AI assistant")).toBe(false);

  presence.aiAssistantDocked.set(0);
  await nextFrame();
  expect(isDisabled("Resize AI assistant")).toBe(true);

  presence.aiAssistantDocked.set(1);
  presence.aiAssistantHasRoom.set(0);
  await nextFrame();
  expect(isDisabled("Resize AI assistant")).toBe(true);

  presence.aiAssistantHasRoom.set(1);
  await nextFrame();
  expect(isDisabled("Resize AI assistant")).toBe(false);
});

it("holds the docked panels' separators only while the canvas shows", () => {
  const { showCanvas } = renderResizers({ canvasShows: false });
  expect(screen.getAllByRole("separator")).toHaveLength(1);

  showCanvas(true);
  expect(screen.getAllByRole("separator")).toHaveLength(4);
});
