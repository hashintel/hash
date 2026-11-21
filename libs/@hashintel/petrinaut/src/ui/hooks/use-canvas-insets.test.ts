import { describe, expect, it } from "vitest";

import { getCanvasInsets, type PanelLayoutState } from "./use-canvas-insets";

const closed: PanelLayoutState = {
  leftSidebarShown: 0,
  leftSidebarWidth: 320,
  propertiesPanelShown: 0,
  propertiesPanelWidth: 450,
  aiAssistantCover: 0,
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

  it("counts the bottom panel's height, not its open state alone", () => {
    expect(
      getCanvasInsets({
        ...closed,
        bottomPanelShown: 1,
        bottomPanelHeight: 240,
      }).bottom,
    ).toBe(240);
  });
});
