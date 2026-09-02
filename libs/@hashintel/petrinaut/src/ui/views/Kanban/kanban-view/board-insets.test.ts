import { describe, expect, it } from "vitest";

import { PANEL_MARGIN } from "../../../constants/ui";
import { getBoardInsets } from "./board-insets";

const allClosed = {
  isLeftSidebarOpen: false,
  isSearchOpen: false,
  leftSidebarWidth: 320,
  hasSelection: false,
  propertiesPanelWidth: 450,
  isBottomPanelOpen: false,
  bottomPanelHeight: 180,
};

describe("getBoardInsets", () => {
  it("keeps the board flush with the container when no panel is showing", () => {
    expect(getBoardInsets(allClosed)).toEqual({ left: 0, right: 0, bottom: 0 });
  });

  it("insets the board by the open sidebar's current width", () => {
    expect(
      getBoardInsets({
        ...allClosed,
        isLeftSidebarOpen: true,
        leftSidebarWidth: 280,
      }).left,
    ).toBe(280 + PANEL_MARGIN);
  });

  it("treats the sidebar as showing while search is open", () => {
    expect(getBoardInsets({ ...allClosed, isSearchOpen: true }).left).toBe(
      320 + PANEL_MARGIN,
    );
  });

  it("insets the board by the properties panel while something is selected", () => {
    expect(getBoardInsets({ ...allClosed, hasSelection: true }).right).toBe(
      450 + PANEL_MARGIN,
    );
  });

  it("insets the board by the open bottom panel's height", () => {
    expect(
      getBoardInsets({
        ...allClosed,
        isBottomPanelOpen: true,
        bottomPanelHeight: 240,
      }).bottom,
    ).toBe(240 + PANEL_MARGIN);
  });
});
