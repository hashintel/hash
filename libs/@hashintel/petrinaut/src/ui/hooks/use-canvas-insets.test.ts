import { describe, expect, it } from "vitest";

import { getCanvasInsets, type PanelLayoutState } from "./use-canvas-insets";

const closed: PanelLayoutState = {
  isLeftSidebarOpen: false,
  isSearchOpen: false,
  leftSidebarWidth: 320,
  hasSelection: false,
  propertiesPanelWidth: 450,
  isAiAssistantOpen: false,
  aiAssistantWidth: 500,
  isBottomPanelOpen: false,
  bottomPanelHeight: 180,
};

describe("getCanvasInsets", () => {
  it("counts nothing while every panel is closed", () => {
    expect(getCanvasInsets(closed)).toEqual({ left: 0, right: 0, bottom: 0 });
  });

  it("counts the left sidebar whether the toggle or search opened it", () => {
    expect(getCanvasInsets({ ...closed, isLeftSidebarOpen: true }).left).toBe(
      320,
    );
    expect(getCanvasInsets({ ...closed, isSearchOpen: true }).left).toBe(320);
  });

  it("counts the properties panel only against a selection", () => {
    expect(getCanvasInsets(closed).right).toBe(0);
    expect(getCanvasInsets({ ...closed, hasSelection: true }).right).toBe(450);
  });

  it("stacks the assistant on the properties panel, which it docks beside", () => {
    expect(getCanvasInsets({ ...closed, isAiAssistantOpen: true }).right).toBe(
      500,
    );
    expect(
      getCanvasInsets({
        ...closed,
        hasSelection: true,
        isAiAssistantOpen: true,
      }).right,
    ).toBe(950);
  });

  it("counts the bottom panel's height, not its open state alone", () => {
    expect(
      getCanvasInsets({
        ...closed,
        isBottomPanelOpen: true,
        bottomPanelHeight: 240,
      }).bottom,
    ).toBe(240);
  });
});
