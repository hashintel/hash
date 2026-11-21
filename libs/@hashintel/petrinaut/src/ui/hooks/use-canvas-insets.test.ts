import { describe, expect, it } from "vitest";

import { getCanvasInsets, type PanelLayoutState } from "./use-canvas-insets";

const closed: PanelLayoutState = {
  leftSidebarShown: 0,
  leftSidebarWidth: 320,
  propertiesPanelShown: 0,
  propertiesPanelWidth: 450,
  aiAssistantCover: 0,
  isAiAssistantOpen: false,
  aiAssistantWidth: 500,
  aiAssistantDockHeight: null,
  isAiAssistantCollapsed: false,
  bottomPanelShown: 0,
  bottomPanelHeight: 180,
};

describe("getCanvasInsets", () => {
  it("counts nothing while every panel is closed", () => {
    expect(getCanvasInsets(closed)).toEqual({ left: 0, right: 0, bottom: 0 });
  });

  it("counts a panel as far as it has slid in", () => {
    expect(getCanvasInsets({ ...closed, leftSidebarShown: 1 }).left).toBe(320);
    expect(getCanvasInsets({ ...closed, leftSidebarShown: 0.5 }).left).toBe(
      160,
    );
    expect(getCanvasInsets({ ...closed, bottomPanelShown: 0.25 }).bottom).toBe(
      45,
    );
  });

  it("counts the properties panel only while it is in view", () => {
    expect(getCanvasInsets(closed).right).toBe(0);
    expect(getCanvasInsets({ ...closed, propertiesPanelShown: 1 }).right).toBe(
      450,
    );
  });

  it("counts what a docking assistant covers, on top of the properties panel it moves in", () => {
    expect(getCanvasInsets({ ...closed, aiAssistantCover: 200 }).right).toBe(
      200,
    );
    expect(
      getCanvasInsets({
        ...closed,
        aiAssistantCover: 200,
        propertiesPanelShown: 1,
      }).right,
    ).toBe(650);
  });

  it("leaves the docked assistant's separate column out of the canvas insets", () => {
    expect(getCanvasInsets({ ...closed, isAiAssistantOpen: true }).right).toBe(
      0,
    );
    expect(
      getCanvasInsets({
        ...closed,
        propertiesPanelShown: 1,
        isAiAssistantOpen: true,
      }).right,
    ).toBe(450);
  });

  it("reserves no canvas edge for the movable floating assistant", () => {
    const floating = {
      ...closed,
      isAiAssistantOpen: true,
      propertiesPanelShown: 0,
    };
    expect(getCanvasInsets(floating).right).toBe(0);
    expect(
      getCanvasInsets({ ...floating, propertiesPanelShown: 1 }).right,
    ).toBe(450);
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
        propertiesPanelShown: 1,
        propertiesPanelWidth: 600,
      }).right,
    ).toBe(600);
  });

  it("counts the bottom panel's height, not its open state alone", () => {
    expect(
      getCanvasInsets({
        ...closed,
        bottomPanelShown: 1,
        bottomPanelHeight: 240,
      }).bottom,
    ).toBe(240);
  });

  it("lets the viewport column clear a compact dock above, while the toolbar stays beside it", () => {
    const compact = {
      ...closed,
      isAiAssistantOpen: true,
      isAiAssistantCollapsed: true,
      aiAssistantDockHeight: 84,
    };
    expect(getCanvasInsets(compact)).toEqual({
      left: 0,
      right: 512,
      bottom: 0,
    });
    expect(getCanvasInsets(compact, { aboveCollapsedDock: true })).toEqual({
      left: 0,
      right: 0,
      bottom: 96,
    });
    expect(
      getCanvasInsets(
        { ...compact, propertiesPanelShown: 1, bottomPanelShown: 1 },
        { aboveCollapsedDock: true },
      ),
    ).toEqual({ left: 0, right: 450, bottom: 180 });
    expect(
      getCanvasInsets(
        { ...compact, aiAssistantDockHeight: 320, bottomPanelShown: 1 },
        { aboveCollapsedDock: true },
      ),
    ).toEqual({ left: 0, right: 0, bottom: 332 });
  });

  it("keeps expanded positioning and ignores a closing dock's last measurement", () => {
    expect(
      getCanvasInsets(
        { ...closed, isAiAssistantOpen: true },
        { aboveCollapsedDock: true },
      ),
    ).toEqual({ left: 0, right: 0, bottom: 0 });
    expect(
      getCanvasInsets(
        { ...closed, aiAssistantDockHeight: 84 },
        { aboveCollapsedDock: true },
      ),
    ).toEqual({ left: 0, right: 0, bottom: 0 });
  });
});
