import { arcsPerRun } from "./arc-runs";

import type { ArcShape } from "./arc-shapes";

/**
 * The element that holds the pulse of an arc, under the arc's line, or
 * `null` when the page does not have it.
 *
 * `runs` is the element whose children are the runs as `ArcRunStrokes`
 * draws them, in order, and `index` the place of the arc among all the
 * shapes. An arc at rest pulses in the holder of its run, under the merged
 * strokes. An arc that draws its own strokes pulses in the holder of its own
 * group, which `ArcOwnStrokes` names after the arc.
 */
export const pulseHolderOf = (
  runs: Element | null,
  shape: Pick<ArcShape, "id" | "alone">,
  index: number,
): Element | null => {
  const run = runs?.children[Math.floor(index / arcsPerRun)];
  if (!run) {
    return null;
  }
  const group = shape.alone
    ? Array.from(run.children).find(
        (child) => child.getAttribute("data-arc") === shape.id,
      )
    : run;
  return group?.querySelector(":scope > .arc-pulses") ?? null;
};
