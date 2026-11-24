import { expect, it } from "vitest";

import {
  assistantCover,
  createPanelPresence,
  type PanelPlacement,
} from "./panel-presence";

const allClosed: PanelPlacement = {
  open: {
    leftSidebar: false,
    propertiesPanel: false,
    bottomPanel: false,
    aiAssistant: false,
  },
  isAssistantDocked: true,
};

it("starts each panel where its placement puts it", () => {
  const presence = createPanelPresence({
    ...allClosed,
    open: { ...allClosed.open, leftSidebar: true },
  });

  expect(presence.shown.leftSidebar.get()).toBe(1);
  expect(presence.shown.bottomPanel.get()).toBe(0);
  expect(presence.aiAssistantDocked.get()).toBe(1);
  expect(presence.aiAssistantHasRoom.get()).toBe(0);
});

it("gives an assistant that is open and docked the room beside the editor", () => {
  const open = { ...allClosed.open, aiAssistant: true };

  expect(
    createPanelPresence({
      open,
      isAssistantDocked: true,
    }).aiAssistantHasRoom.get(),
  ).toBe(1);
  expect(
    createPanelPresence({
      open,
      isAssistantDocked: false,
    }).aiAssistantHasRoom.get(),
  ).toBe(0);
});

it("covers the editor with a docked assistant only while it arrives or leaves", () => {
  const presence = createPanelPresence({
    open: { ...allClosed.open, aiAssistant: true },
    isAssistantDocked: true,
  });
  // At rest beside the editor.
  expect(assistantCover(presence, 420)).toBe(0);

  // Leaving: the editor has the room back, and the panel slides out over it.
  presence.aiAssistantHasRoom.set(0);
  expect(assistantCover(presence, 420)).toBe(420);
  presence.shown.aiAssistant.set(0.5);
  expect(assistantCover(presence, 420)).toBe(210);
  presence.shown.aiAssistant.set(0);
  expect(assistantCover(presence, 420)).toBe(0);
});

it("covers nothing with a floating assistant", () => {
  const presence = createPanelPresence({
    open: { ...allClosed.open, aiAssistant: true },
    isAssistantDocked: false,
  });

  expect(assistantCover(presence, 420)).toBe(0);
});
