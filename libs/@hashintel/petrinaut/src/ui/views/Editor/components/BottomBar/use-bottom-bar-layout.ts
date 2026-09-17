import { useCallback, useState } from "react";

import { useElementSize } from "../../../../../react/hooks/use-element-size";
import { VIEWPORT_CONTROLS_CLEARANCE } from "../../../../constants/ui";
import { useCanvasInsets } from "../../../../hooks/use-canvas-insets";
import { fitsWithinBounds, getBottomBarOffset } from "./bottom-bar-placement";
import { type CollapsibleGroupWidth } from "./collapse-context";

/** Gap kept between the bar and a panel it has been pushed away from. */
const BOTTOM_BAR_MARGIN = 12;

export interface BottomBarLayout {
  /** CSS translation that clears the panels using the bar's rendered width. */
  readonly offsetX: string;
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
 * Each collapsible group reports its natural and occupied widths, keeping the
 * fit calculation stable throughout animation. CSS positions the visible bar.
 *
 * Whether the hidden controls are on screen is not decided here at all: hover,
 * keyboard focus and an open menu reveal them in CSS, which cannot go stale
 * the way mirrored state does.
 */
export const useBottomBarLayout = (
  /** Spans the main view; the bar is centred in it and measured against it. */
  laneRef: React.RefObject<HTMLDivElement | null>,
  barRef: React.RefObject<HTMLDivElement | null>,
  {
    hasViewportControls,
  }: {
    hasViewportControls: boolean;
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
          current.rendered === width.rendered
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
  for (const width of groupWidths.values()) {
    hiddenWidth += width.natural - width.rendered;
  }

  // What the bar would take with every control shown. Its two terms move
  // together while a group folds, so the sum holds still throughout.
  const expandedWidth = barWidth + hiddenWidth;
  const isCollapsed = !fitsWithinBounds(bounds, expandedWidth);

  return {
    offsetX: getBottomBarOffset(bounds),
    liftY: insets.bottom,
    isCollapsed,
    reportGroupWidth,
  };
};
