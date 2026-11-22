/**
 * The arcs at rest, merged into a few paths.
 *
 * An arc that is in no focus and does not move looks like every other arc of
 * its colour, so the arcs of one colour can be one path, which the browser
 * styles, fades and paints as one element. One path for a whole net would
 * put every line of one colour above every line of another, wherever they
 * are in the document. So the arcs are cut into runs of consecutive arcs,
 * and each run is drawn whole above the run before it: its merged strokes,
 * then the strokes of its arcs that draw their own. The shorter the run, the
 * closer the stacking stays to the order of the document, and the more
 * paths the net has.
 */

import type { ArcShape } from "./arc-shapes";

/** How many consecutive arcs of the document share their paths. */
export const arcsPerRun = 64;

/**
 * What the arcs of one colour draw together: the line of each up to its
 * head, the whole line of each, and the head of each.
 */
export type MergedStrokes = {
  color: string;
  shafts: string;
  lines: string;
  heads: string;
};

export type ArcRun = {
  /** The arcs of the run that draw no strokes of their own, in order. */
  members: readonly ArcShape[];
  /**
   * Their strokes by colour, in the order each colour first appears. The
   * same object for as long as the members are.
   */
  strokes: readonly MergedStrokes[];
  /** The arcs of the run that draw their own strokes, in order. */
  own: readonly ArcShape[];
};

const strokesOf = (members: readonly ArcShape[]): MergedStrokes[] => {
  const byColor = new Map<string, MergedStrokes>();
  for (const { color, paths } of members) {
    const strokes = byColor.get(color);
    if (strokes) {
      strokes.shafts += paths.shaft;
      strokes.lines += paths.curve;
      strokes.heads += paths.head;
    } else {
      byColor.set(color, {
        color,
        shafts: paths.shaft,
        lines: paths.curve,
        heads: paths.head,
      });
    }
  }
  return [...byColor.values()];
};

const sameShapes = (
  left: readonly ArcShape[],
  right: readonly ArcShape[],
): boolean =>
  left.length === right.length &&
  left.every((shape, index) => shape === right[index]);

/**
 * The runs of a scene's arcs. A run whose arcs are the same objects as in
 * the runs before is the same object. A frame that moves a few arcs writes
 * the merged paths of no run: an arc that moves draws its own strokes, and
 * the strokes of its run are kept.
 */
export const arcRuns = (
  shapes: readonly ArcShape[],
  previous: readonly ArcRun[] = [],
): readonly ArcRun[] => {
  const runs: ArcRun[] = [];
  for (let start = 0; start < shapes.length; start += arcsPerRun) {
    const arcs = shapes.slice(start, start + arcsPerRun);
    const members = arcs.filter((shape) => !shape.alone);
    const own = arcs.filter((shape) => shape.alone);
    const was = previous[runs.length];
    const sameMembers = was !== undefined && sameShapes(was.members, members);
    runs.push(
      sameMembers && sameShapes(was.own, own)
        ? was
        : {
            members,
            strokes: sameMembers ? was.strokes : strokesOf(members),
            own,
          },
    );
  }
  return runs.length === previous.length &&
    runs.every((run, index) => run === previous[index])
    ? previous
    : runs;
};
