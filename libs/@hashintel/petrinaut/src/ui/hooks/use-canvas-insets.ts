import { use } from "react";

import { EditorContext } from "../../react/state/editor-context";
import { assistantCover } from "../../react/state/panel-presence";
import { usePanelPresence } from "../../react/state/panel-presence-context";
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

/**
 * What the insets are worked out from. How far a panel is in view goes from
 * 0 (closed) to 1 (open), and is in between while the panel slides.
 */
export interface PanelLayoutState {
  readonly leftSidebarShown: number;
  readonly leftSidebarWidth: number;
  readonly propertiesPanelShown: number;
  readonly propertiesPanelWidth: number;
  /** How much of a docking AI assistant lies over the editor's right edge. */
  readonly aiAssistantCover: number;
  readonly isAiAssistantOpen: boolean;
  readonly aiAssistantWidth: number;
  readonly aiAssistantDockHeight: number | null;
  readonly isAiAssistantCollapsed: boolean;
  readonly bottomPanelShown: number;
  readonly bottomPanelHeight: number;
}

interface CanvasInsetOptions {
  /** The viewport column clears the compact dock above, not beside it. */
  readonly aboveCollapsedDock?: boolean;
}

/**
 * Each edge's rule is the one the panel on it renders by: a panel covers its
 * edge as far as it has slid in, and a compact Voice dock stays at the right
 * edge. The expanded, docked assistant has its own column outside the canvas,
 * except while it arrives or leaves, when it covers the right edge and the
 * Properties panel moves in from it. A movable assistant reserves no edge.
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
    left: state.leftSidebarShown * (state.leftSidebarWidth + PANEL_MARGIN),
    right:
      state.aiAssistantCover +
      Math.max(
        state.propertiesPanelShown *
          (state.propertiesPanelWidth + PANEL_MARGIN),
        state.isAiAssistantOpen &&
          state.isAiAssistantCollapsed &&
          dockHeight === null
          ? state.aiAssistantWidth + 12
          : 0,
      ),
    bottom: Math.max(
      state.bottomPanelShown * (state.bottomPanelHeight + PANEL_MARGIN),
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
 * out from the panels' sizes and presence when it is called: for whatever
 * floats over the canvas and has to keep clear of them, without rendering on
 * each pointer move of a panel drag or each frame of a panel sliding.
 *
 * It is a reading. A style bound with `styleRef`, an effect that calls
 * `watch` and a component that calls `useReading` follow the panels through
 * it, and code that needs the insets once calls it.
 *
 * The panels overlay the canvas rather than shrinking it, so a floating
 * control cannot read this off its own layout.
 */
export const useCanvasInsetsReader = (
  options?: CanvasInsetOptions,
): (() => CanvasInsets) => {
  const presentation = usePetrinautPresentation();
  const { isAiAssistantOpen, aiAssistantDockHeight, isAiAssistantCollapsed } =
    use(EditorContext);
  const panelSizes = usePanelSizes();
  const presence = usePanelPresence();
  const aboveCollapsedDock = options?.aboveCollapsedDock ?? false;
  // Where the panels sit beside the canvas rather than over it, the canvas is
  // already the space it occupies and there is nothing to keep clear of.
  const overlaid = presentation.panelsOverlayCanvas;

  return () => {
    // Every value is read before any condition, so whatever follows this
    // function follows all of them.
    const aiAssistantWidth = panelSizes.aiAssistantWidth.get();
    const state: PanelLayoutState = {
      leftSidebarShown: presence.shown.leftSidebar.get(),
      leftSidebarWidth: panelSizes.leftSidebarWidth.get(),
      propertiesPanelShown: presence.shown.propertiesPanel.get(),
      propertiesPanelWidth: panelSizes.propertiesPanelWidth.get(),
      bottomPanelShown: presence.shown.bottomPanel.get(),
      bottomPanelHeight: panelSizes.bottomPanelHeight.get(),
      aiAssistantCover: assistantCover(presence, aiAssistantWidth),
      aiAssistantWidth,
      isAiAssistantOpen,
      aiAssistantDockHeight,
      isAiAssistantCollapsed,
    };

    return overlaid
      ? getCanvasInsets(state, { aboveCollapsedDock })
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
