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
  aiAssistantDockHeight: null,
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

  it("lets the viewport column clear a compact dock above, while the toolbar stays beside it", () => {
    const compact = {
      ...closed,
      isAiAssistantOpen: true,
      aiAssistantDockHeight: 84,
    };
    expect(getCanvasInsets(compact)).toEqual({
      left: 0,
      right: 500,
      bottom: 0,
    });
    expect(getCanvasInsets(compact, { aboveCollapsedDock: true })).toEqual({
      left: 0,
      right: 0,
      bottom: 84,
    });
    expect(
      getCanvasInsets(
        { ...compact, hasSelection: true, isBottomPanelOpen: true },
        { aboveCollapsedDock: true },
      ),
    ).toEqual({ left: 0, right: 450, bottom: 180 });
    expect(
      getCanvasInsets(
        { ...compact, aiAssistantDockHeight: 320, isBottomPanelOpen: true },
        { aboveCollapsedDock: true },
      ),
    ).toEqual({ left: 0, right: 0, bottom: 320 });
  });

  it("keeps expanded positioning and ignores a closing dock's last measurement", () => {
    expect(
      getCanvasInsets(
        { ...closed, isAiAssistantOpen: true },
        { aboveCollapsedDock: true },
      ),
    ).toEqual({ left: 0, right: 500, bottom: 0 });
    expect(
      getCanvasInsets(
        { ...closed, aiAssistantDockHeight: 84 },
        { aboveCollapsedDock: true },
      ),
    ).toEqual({ left: 0, right: 0, bottom: 0 });
  });
});
