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
  aiAssistantPlacement: "docked",
  isAiAssistantCollapsed: false,
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

  it("leaves the docked assistant's separate column out of the canvas insets", () => {
    expect(getCanvasInsets({ ...closed, isAiAssistantOpen: true }).right).toBe(
      0,
    );
    expect(
      getCanvasInsets({
        ...closed,
        hasSelection: true,
        isAiAssistantOpen: true,
      }).right,
    ).toBe(450);
  });

  it("reserves no canvas edge for the movable floating assistant", () => {
    const floating = {
      ...closed,
      aiAssistantPlacement: "floating" as const,
      isAiAssistantOpen: true,
      hasSelection: false,
    };
    expect(getCanvasInsets(floating).right).toBe(0);
    expect(getCanvasInsets({ ...floating, hasSelection: true }).right).toBe(
      450,
    );
    expect(
      getCanvasInsets({ ...floating, isAiAssistantOpen: false }).right,
    ).toBe(0);
  });

  it("leaves room for a compact voice dock until it expands or closes", () => {
    const compact = {
      ...closed,
      isAiAssistantOpen: true,
      isAiAssistantCollapsed: true,
    };
    expect(getCanvasInsets(compact).right).toBe(512);
    expect(
      getCanvasInsets({ ...compact, isAiAssistantCollapsed: false }).right,
    ).toBe(0);
    expect(
      getCanvasInsets({ ...compact, isAiAssistantOpen: false }).right,
    ).toBe(0);
    expect(
      getCanvasInsets({
        ...compact,
        hasSelection: true,
        propertiesPanelWidth: 600,
      }).right,
    ).toBe(600);
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
