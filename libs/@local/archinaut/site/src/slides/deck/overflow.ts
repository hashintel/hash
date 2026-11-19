/**
 * Whether a slide's content fits it. Two ways content can fail to fit:
 *
 * - a box runs past the slide's edges, which the browser does not report
 *   as scroll size on a slide that lets its content overflow, so it is
 *   measured from where each box is drawn;
 * - a box inside the slide scrolls, since a scrollbar on a slide is content
 *   nobody will see.
 *
 * Boxes that clip on purpose, such as an ellipsised kicker, are left out:
 * what they hide cannot reach past the slide.
 */

/** The sizes the DOM reports for one box, in CSS pixels before scaling. */
export interface BoxExtent {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Where a box is drawn, as `getBoundingClientRect` reports it. */
export interface BoxRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/** A difference this small is rounding, not overflow. */
const tolerance = 1;

const settle = (furthest: number): number =>
  furthest > tolerance ? Math.round(furthest) : 0;

/** How far the furthest content runs past its scrolling box, or 0 when everything fits. */
export const overflowOf = (boxes: Iterable<BoxExtent>): number => {
  let furthest = 0;
  for (const box of boxes) {
    furthest = Math.max(
      furthest,
      box.scrollWidth - box.clientWidth,
      box.scrollHeight - box.clientHeight,
    );
  }
  return settle(furthest);
};

/**
 * How far any box is drawn past the slide's edges, in the slide's own
 * pixels: `scale` is how much the canvas is scaled on screen. A box with no
 * size, such as one with `display: none`, is not drawn and is skipped.
 */
export const spillOf = (
  slide: BoxRect,
  boxes: Iterable<BoxRect>,
  scale: number,
): number => {
  let furthest = 0;
  for (const box of boxes) {
    if (box.width === 0 && box.height === 0) {
      continue;
    }
    furthest = Math.max(
      furthest,
      box.bottom - slide.bottom,
      box.right - slide.right,
      slide.top - box.top,
      slide.left - box.left,
    );
  }
  return settle(furthest / (scale > 0 ? scale : 1));
};

/** Whether a box with these `overflow` values scrolls what does not fit. */
export const scrolls = (overflowX: string, overflowY: string): boolean =>
  [overflowX, overflowY].some(
    (overflow) => overflow === "auto" || overflow === "scroll",
  );

/** Whether a box with these `overflow` values keeps its content inside it. */
export const contains = (overflowX: string, overflowY: string): boolean =>
  overflowX !== "visible" || overflowY !== "visible";
