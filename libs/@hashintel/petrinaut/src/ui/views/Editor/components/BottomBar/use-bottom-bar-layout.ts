import { useCallback, useState } from "react";

import { useElementSize } from "../../../../../react/hooks/use-element-size";
import { VIEWPORT_CONTROLS_CLEARANCE } from "../../../../constants/ui";
import { useCanvasInsets } from "../../../../hooks/use-canvas-insets";
import { fitsWithinBounds, getBottomBarOffset } from "./bottom-bar-placement";
import { type CollapsibleGroupWidth } from "./collapse-context";

/** Gap kept between the bar and a panel it has been pushed away from. */
const BOTTOM_BAR_MARGIN = 12;

export interface BottomBarLayout {
  /** Shift from the centred position that clears the panels, in px. */
  readonly offsetX: number;
  /** How far the bottom panel lifts the bar, in px. */
  readonly liftY: number;
  /** True while the bar has room only for its essential controls. */
  readonly isCollapsed: boolean;
  /** Reports what one collapsible group takes up. See the collapse context. */
  readonly reportGroupWidth: (
    id: string,
    width: CollapsibleGroupWidth | null,
  ) => void;
}

/**
 * Places the bottom bar between the docked panels and decides whether it has
 * room for every control.
 *
 * The bar is measured rather than modelled: its own width is what the offset
 * clamps, and each collapsible group reports both what it takes when shown and
 * what it is currently hiding, so the decision never chases itself.
 *
 * Whether the hidden controls are on screen is not decided here at all: hover,
 * keyboard focus and an open menu reveal them in CSS, which cannot go stale
 * the way mirrored state does.
 */
export const useBottomBarLayout = (
  /** Spans the canvas; the bar is centred in it and measured against it. */
  laneRef: React.RefObject<HTMLDivElement | null>,
  barRef: React.RefObject<HTMLDivElement | null>,
  {
    hasViewportControls,
    isAnimating,
  }: {
    hasViewportControls: boolean;
    /** True while a panel opens or closes, and the bar transitions with it. */
    isAnimating: boolean;
  },
): BottomBarLayout => {
  const containerWidth = useElementSize(laneRef, { box: "border" })?.width ?? 0;
  const barWidth = useElementSize(barRef, { box: "border" })?.width ?? 0;

  const [groupWidths, setGroupWidths] = useState<
    ReadonlyMap<string, CollapsibleGroupWidth>
  >(() => new Map());

  // Identity is load-bearing rather than a performance nicety: every group
  // measures from an effect keyed on this callback, and a new one each render
  // would tear the observers down and report a width in a loop.
  const reportGroupWidth = useCallback(
    (id: string, width: CollapsibleGroupWidth | null) => {
      setGroupWidths((previous) => {
        const current = previous.get(id);
        if (width === null) {
          if (!current) {
            return previous;
          }
          const next = new Map(previous);
          next.delete(id);
          return next;
        }
        if (
          current &&
          current.natural === width.natural &&
          current.hidden === width.hidden
        ) {
          return previous;
        }
        return new Map(previous).set(id, width);
      });
    },
    [],
  );

  const insets = useCanvasInsets();
  const bounds = {
    containerWidth,
    leftInset: insets.left,
    // The viewport controls sit in the bar's row on the right of the canvas,
    // so they bound it the same way a panel does. They are absent in actual
    // mode, where `SDCPNCanvas` does not render them.
    rightInset:
      insets.right + (hasViewportControls ? VIEWPORT_CONTROLS_CLEARANCE : 0),
    margin: BOTTOM_BAR_MARGIN,
  };

  let hiddenWidth = 0;
  let collapsibleWidth = 0;
  for (const width of groupWidths.values()) {
    hiddenWidth += width.hidden;
    collapsibleWidth += width.natural;
  }

  // What the bar would take with every control shown. Its two terms move
  // together while a group folds, so the sum holds still throughout.
  const expandedWidth = barWidth + hiddenWidth;
  const isCollapsed = !fitsWithinBounds(bounds, expandedWidth);

  // While a panel animates, the bar's own transition carries it there, and an
  // offset taken from a width that is itself animating would restart that
  // transition every frame. The width the bar is heading for steps once
  // instead. With no transition running, the measured width is what keeps the
  // bar glued to its own collapse and to a panel edge being dragged.
  const settledWidth = isCollapsed
    ? expandedWidth - collapsibleWidth
    : expandedWidth;

  return {
    offsetX: getBottomBarOffset(bounds, isAnimating ? settledWidth : barWidth),
    liftY: insets.bottom,
    isCollapsed,
    reportGroupWidth,
  };
};
