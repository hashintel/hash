import { assistantCover } from "../../react/state/panel-presence";
import { usePanelPresence } from "../../react/state/panel-presence-context";
import { usePanelSizes } from "../../react/state/panel-sizes-context";
import { PANEL_MARGIN } from "../constants/ui";
import { useReading } from "../lib/readings";
import { usePetrinautPresentation } from "../presentation/presentation-context";

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
  readonly bottomPanelShown: number;
  readonly bottomPanelHeight: number;
}

/**
 * Each edge's rule is the one the panel on it renders by: a panel covers its
 * edge as far as it has slid in. The docked assistant has its own column
 * outside the canvas, except while it arrives or leaves, when it covers the
 * right edge and the Properties panel moves in from it. A movable assistant
 * reserves no edge.
 */
export const getCanvasInsets = (state: PanelLayoutState): CanvasInsets => ({
  left: state.leftSidebarShown * (state.leftSidebarWidth + PANEL_MARGIN),
  right:
    state.aiAssistantCover +
    state.propertiesPanelShown * (state.propertiesPanelWidth + PANEL_MARGIN),
  bottom: state.bottomPanelShown * (state.bottomPanelHeight + PANEL_MARGIN),
});

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
export const useCanvasInsetsReader = (): (() => CanvasInsets) => {
  const presentation = usePetrinautPresentation();
  const panelSizes = usePanelSizes();
  const presence = usePanelPresence();
  // Where the panels sit beside the canvas rather than over it, the canvas is
  // already the space it occupies and there is nothing to keep clear of.
  const overlaid = presentation.panelsOverlayCanvas;

  return () => {
    // Every value is read before any condition, so whatever follows this
    // function follows all of them.
    const state: PanelLayoutState = {
      leftSidebarShown: presence.shown.leftSidebar.get(),
      leftSidebarWidth: panelSizes.leftSidebarWidth.get(),
      propertiesPanelShown: presence.shown.propertiesPanel.get(),
      propertiesPanelWidth: panelSizes.propertiesPanelWidth.get(),
      bottomPanelShown: presence.shown.bottomPanel.get(),
      bottomPanelHeight: panelSizes.bottomPanelHeight.get(),
      aiAssistantCover: assistantCover(
        presence,
        panelSizes.aiAssistantWidth.get(),
      ),
    };

    return overlaid ? getCanvasInsets(state) : NO_INSETS;
  };
};

/**
 * The insets as a value, for a component that computes with them while
 * rendering. It renders on every pointer move of a panel drag: an element
 * that only positions itself follows {@link useCanvasInsetsReader} instead.
 */
export const useCanvasInsets = (): CanvasInsets =>
  useReading(useCanvasInsetsReader(), sameInsets);
