/**
 * Keeps the focused worksheet element clear of its scroll container's
 * edges. Hosts fade the edges of their scroll areas, and a focus scroll
 * that parks the element flush against an edge leaves it under the fade —
 * so on focus, every scrollable ancestor is nudged until the element keeps
 * {@link FOCUS_CLEARANCE_PX} of clearance. This is the JS twin of the
 * `scroll-margin` the form's triggers declare: CSS covers the scrolls the
 * browser performs itself, the nudge covers the case CSS cannot reach — an
 * element already fully visible inside the faded band.
 *
 * One deliberate exception: a focus that follows a fresh pointer press on
 * the same element does not nudge. The pointer proves the user sees the
 * element, and moving it between the two clicks of a double-click would
 * make the second click miss its target (the worksheet's click-count
 * activation).
 */

import { useRef } from "react";

export const FOCUS_CLEARANCE_PX = 25;

/** How long after a pointer press a focus on its target skips the nudge. */
const POINTER_FOCUS_WINDOW_MS = 500;

type Edges = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/**
 * The `scrollBy` deltas that give `rect` the margin inside `container`,
 * `{ top: 0, left: 0 }` when it already has it. An element too large for
 * the container minus both margins aligns its leading edge at the margin
 * (the end-edge correction never pushes the start edge past its own
 * margin).
 */
export function clearanceDelta(
  rect: Edges,
  container: Edges,
  margin: number,
): { top: number; left: number } {
  const axis = (
    start: number,
    end: number,
    containerStart: number,
    containerEnd: number,
  ): number => {
    const headroom = start - (containerStart + margin);
    if (headroom < 0) {
      return headroom;
    }
    const overshoot = end - (containerEnd - margin);
    if (overshoot > 0) {
      return Math.min(overshoot, headroom);
    }
    return 0;
  };
  return {
    top: axis(rect.top, rect.bottom, container.top, container.bottom),
    left: axis(rect.left, rect.right, container.left, container.right),
  };
}

function isScrollable(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll";
}

/** Nudges every scrollable ancestor until `target` has its clearance. */
export function nudgeIntoClearance(
  target: HTMLElement,
  margin: number = FOCUS_CLEARANCE_PX,
): void {
  let rect = target.getBoundingClientRect();
  for (
    let node = target.parentElement;
    node !== null;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    const scrollableY =
      isScrollable(style.overflowY) && node.scrollHeight > node.clientHeight;
    const scrollableX =
      isScrollable(style.overflowX) && node.scrollWidth > node.clientWidth;
    if (!scrollableY && !scrollableX) {
      continue;
    }
    const delta = clearanceDelta(rect, node.getBoundingClientRect(), margin);
    const top = scrollableY ? delta.top : 0;
    const left = scrollableX ? delta.left : 0;
    if (top !== 0 || left !== 0) {
      node.scrollBy({ top, left, behavior: "instant" });
      rect = target.getBoundingClientRect();
    }
  }
}

/**
 * Capture-phase handlers for the worksheet root: spread them onto the
 * element that hosts the tables, and every focus inside keeps its
 * clearance.
 */
export function useFocusClearance(): {
  onPointerDownCapture: (event: React.PointerEvent<HTMLElement>) => void;
  onFocusCapture: (event: React.FocusEvent<HTMLElement>) => void;
} {
  const lastPress = useRef<{ target: EventTarget | null; at: number }>({
    target: null,
    at: 0,
  });
  return {
    onPointerDownCapture: (event) => {
      lastPress.current = { target: event.target, at: performance.now() };
    },
    onFocusCapture: (event) => {
      const target = event.target;
      const press = lastPress.current;
      const pointerCaused =
        press.target !== null &&
        performance.now() - press.at < POINTER_FOCUS_WINDOW_MS &&
        press.target instanceof Node &&
        target.contains(press.target);
      if (pointerCaused) {
        return;
      }
      nudgeIntoClearance(target);
    },
  };
}
