import { use } from "react";

import { EditorContext } from "../../react/state/editor-context";
import { PANEL_MARGIN } from "../constants/ui";

/** How much of the canvas each edge's panels cover, in CSS pixels. */
export interface CanvasInsets {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/** The editor state the insets are derived from. */
export interface PanelLayoutState {
  readonly isLeftSidebarOpen: boolean;
  readonly isSearchOpen: boolean;
  readonly leftSidebarWidth: number;
  readonly hasSelection: boolean;
  readonly propertiesPanelWidth: number;
  readonly isAiAssistantOpen: boolean;
  readonly aiAssistantWidth: number;
  readonly isBottomPanelOpen: boolean;
  readonly bottomPanelHeight: number;
}

/**
 * Each edge's rule is the one the panel on it renders by: search opens the
 * left sidebar without the toggle, a selection opens the properties panel, and
 * the assistant docks beside the properties panel rather than over it, so an
 * open pair covers the sum of the two.
 */
export const getCanvasInsets = (state: PanelLayoutState): CanvasInsets => ({
  left:
    state.isLeftSidebarOpen || state.isSearchOpen
      ? state.leftSidebarWidth + PANEL_MARGIN
      : 0,
  right:
    (state.hasSelection ? state.propertiesPanelWidth + PANEL_MARGIN : 0) +
    (state.isAiAssistantOpen ? state.aiAssistantWidth : 0),
  bottom: state.isBottomPanelOpen ? state.bottomPanelHeight + PANEL_MARGIN : 0,
});

/**
 * What the docked panels take out of the canvas, for the controls that float
 * over it and have to keep clear of them.
 *
 * The panels overlay the canvas rather than shrinking it, so a floating
 * control cannot read this off its own layout.
 */
export const useCanvasInsets = (): CanvasInsets =>
  getCanvasInsets(use(EditorContext));
