import { use } from "react";

import { EditorContext } from "../../react/state/editor-context";
import { usePanelSizes } from "../../react/state/panel-sizes-context";
import { PANEL_MARGIN } from "../constants/ui";
import { useReading } from "../lib/readings";
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

const NO_INSETS: CanvasInsets = { left: 0, right: 0, bottom: 0 };

export const sameInsets = (previous: CanvasInsets, next: CanvasInsets) =>
  previous.left === next.left &&
  previous.right === next.right &&
  previous.bottom === next.bottom;

/**
 * What the docked panels take out of the canvas, as a function that works it
 * out from the panel sizes when it is called: for whatever floats over the
 * canvas and has to keep clear of them, without rendering on each pointer
 * move of a panel drag.
 *
 * It is a reading. A style bound with `styleRef`, an effect that calls
 * `watch` and a component that calls `useReading` follow the panel sizes
 * through it, and code that needs the insets once calls it.
 *
 * The panels overlay the canvas rather than shrinking it, so a floating
 * control cannot read this off its own layout.
 */
export const useCanvasInsetsReader = (
  options?: CanvasInsetOptions,
): (() => CanvasInsets) => {
  const presentation = usePetrinautPresentation();
  const {
    isLeftSidebarOpen,
    isSearchOpen,
    hasSelection,
    isAiAssistantOpen,
    aiAssistantDockHeight,
    isAiAssistantCollapsed,
    isBottomPanelOpen,
  } = use(EditorContext);
  const panelSizes = usePanelSizes();
  const aboveCollapsedDock = options?.aboveCollapsedDock ?? false;
  // Where the panels sit beside the canvas rather than over it, the canvas is
  // already the space it occupies and there is nothing to keep clear of.
  const overlaid = presentation.panelsOverlayCanvas;

  return () => {
    // Every size is read before any condition, so whatever follows this
    // function follows all four.
    const sizes = {
      leftSidebarWidth: panelSizes.leftSidebarWidth.get(),
      propertiesPanelWidth: panelSizes.propertiesPanelWidth.get(),
      bottomPanelHeight: panelSizes.bottomPanelHeight.get(),
      aiAssistantWidth: panelSizes.aiAssistantWidth.get(),
    };

    return overlaid
      ? getCanvasInsets(
          {
            isLeftSidebarOpen,
            isSearchOpen,
            hasSelection,
            isAiAssistantOpen,
            aiAssistantDockHeight,
            isAiAssistantCollapsed,
            isBottomPanelOpen,
            ...sizes,
          },
          { aboveCollapsedDock },
        )
      : NO_INSETS;
  };
};

/**
 * The insets as a value, for a component that computes with them while
 * rendering. It renders on every pointer move of a panel drag: an element
 * that only positions itself follows {@link useCanvasInsetsReader} instead.
 */
export const useCanvasInsets = (options?: CanvasInsetOptions): CanvasInsets =>
  useReading(useCanvasInsetsReader(options), sameInsets);
