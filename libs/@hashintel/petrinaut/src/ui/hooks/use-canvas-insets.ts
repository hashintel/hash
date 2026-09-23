import { use } from "react";

import { EditorContext } from "../../react/state/editor-context";
import { PANEL_MARGIN } from "../constants/ui";
import { useHasActiveAiAssistant } from "../plugins/plugin-assistants";
import { usePetrinautPresentation } from "../views/shared/presentation-context";

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
  readonly aiAssistantDockHeight: number | null;
  readonly aiAssistantPlacement: "docked" | "floating";
  readonly isAiAssistantCollapsed: boolean;
  readonly isBottomPanelOpen: boolean;
  readonly bottomPanelHeight: number;
}

interface CanvasInsetOptions {
  /** The viewport column clears the compact dock above, not beside it. */
  readonly aboveCollapsedDock?: boolean;
}

/**
 * Each edge's rule is the one the panel on it renders by: search opens the
 * left sidebar without the toggle, a selection opens the properties panel, and
 * a compact Voice dock stays at the right edge. The expanded, docked assistant
 * has its own column outside the canvas. A movable assistant reserves no edge.
 */
export const getCanvasInsets = (
  state: PanelLayoutState,
  { aboveCollapsedDock = false }: CanvasInsetOptions = {},
): CanvasInsets => {
  const dockHeight =
    aboveCollapsedDock &&
    state.isAiAssistantOpen &&
    state.isAiAssistantCollapsed
      ? state.aiAssistantDockHeight
      : null;
  return {
    left:
      state.isLeftSidebarOpen || state.isSearchOpen
        ? state.leftSidebarWidth + PANEL_MARGIN
        : 0,
    right: Math.max(
      state.hasSelection ? state.propertiesPanelWidth + PANEL_MARGIN : 0,
      state.isAiAssistantOpen &&
        state.isAiAssistantCollapsed &&
        dockHeight === null
        ? state.aiAssistantWidth + 12
        : 0,
    ),
    bottom: Math.max(
      state.isBottomPanelOpen ? state.bottomPanelHeight + PANEL_MARGIN : 0,
      dockHeight === null ? 0 : dockHeight + 12,
    ),
  };
};

/**
 * What the docked panels take out of the canvas, for the controls that float
 * over it and have to keep clear of them.
 *
 * The panels overlay the canvas rather than shrinking it, so a floating
 * control cannot read this off its own layout.
 */
const NO_INSETS: CanvasInsets = { left: 0, right: 0, bottom: 0 };

export const useCanvasInsets = (options?: CanvasInsetOptions): CanvasInsets => {
  const presentation = usePetrinautPresentation();
  const editor = use(EditorContext);
  // The panel is open only while it has an assistant to show: one that fails
  // or stops passing a value leaves the open flag set with nothing on screen.
  const hasAssistant = useHasActiveAiAssistant();

  // Where the panels sit beside the canvas rather than over it, the canvas is
  // already the space it occupies and there is nothing to keep clear of.
  return presentation.panelsOverlayCanvas
    ? getCanvasInsets(
        hasAssistant ? editor : { ...editor, isAiAssistantOpen: false },
        options,
      )
    : NO_INSETS;
};
