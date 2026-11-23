import { useLayoutEffect, useState } from "react";

import { bindStyle, useReading } from "../../../../shared/readings";
import { VIEWPORT_CONTROLS_CLEARANCE } from "../../../../shared/ui-constants";
import {
  useCanvasInsetsReader,
  type CanvasInsets,
} from "../../../../shared/use-canvas-insets";
import { useElementSize } from "../../../../shared/use-element-size";
import { fitsWithinBounds, getBottomBarOffset } from "./bottom-bar-placement";
import {
  type BottomBarCollapseValue,
  type CollapsibleGroupWidth,
} from "./collapse-context";

/** Gap kept between the bar and a panel it has been pushed away from. */
const BOTTOM_BAR_MARGIN = 12;

/** The room the panels and the viewport controls leave the bar. */
const boundsWithin = (
  insets: CanvasInsets,
  containerWidth: number,
  hasViewportControls: boolean,
) => ({
  containerWidth,
  leftInset: insets.left,
  // The viewport controls sit in the bar's row on the right of the canvas,
  // so they bound it the same way a panel does. They are absent in actual
  // mode, where `SDCPNCanvas` does not render them.
  rightInset:
    insets.right + (hasViewportControls ? VIEWPORT_CONTROLS_CLEARANCE : 0),
  margin: BOTTOM_BAR_MARGIN,
});

/**
 * Places the bottom bar between the docked panels and decides whether it has
 * room for every control.
 *
 * The bar's place is written straight onto `barRef`'s element as a transform:
 * a translation that clears the panels using the bar's rendered width, and
 * the lift of the bottom panel. It follows a panel drag with no render. The
 * bar renders only when a drag changes whether it fits.
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
): BottomBarCollapseValue => {
  const containerWidth = useElementSize(laneRef, { box: "border" })?.width ?? 0;
  const barWidth = useElementSize(barRef, { box: "border" })?.width ?? 0;

  const [groupWidths, setGroupWidths] = useState<
    ReadonlyMap<string, CollapsibleGroupWidth>
  >(() => new Map());

  const reportGroupWidth: BottomBarCollapseValue["reportGroupWidth"] = (
    id,
    width,
  ) => {
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
  };

  const readInsets = useCanvasInsetsReader();

  useLayoutEffect(() => {
    const bar = barRef.current;
    return bar
      ? bindStyle(bar, {
          transform: () => {
            const insets = readInsets();
            const bounds = boundsWithin(
              insets,
              containerWidth,
              hasViewportControls,
            );
            return `translate(${getBottomBarOffset(bounds)}, ${-insets.bottom}px)`;
          },
        })
      : undefined;
  }, [barRef, readInsets, containerWidth, hasViewportControls]);

  let hiddenWidth = 0;
  for (const width of groupWidths.values()) {
    hiddenWidth += width.natural - width.rendered;
  }

  // What the bar would take with every control shown. Its two terms move
  // together while a group folds, so the sum holds still throughout.
  const expandedWidth = barWidth + hiddenWidth;
  const isCollapsed = useReading(
    () =>
      !fitsWithinBounds(
        boundsWithin(readInsets(), containerWidth, hasViewportControls),
        expandedWidth,
      ),
  );

  return { isCollapsed, reportGroupWidth };
};
