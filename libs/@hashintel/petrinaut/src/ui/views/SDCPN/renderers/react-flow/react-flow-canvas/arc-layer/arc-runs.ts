/** The arcs at rest, merged run by run into a few paths: arc-layer.mdx. */

import { sameItems } from "../../../../use-stable-items";

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
    const sameMembers = was !== undefined && sameItems(was.members, members);
    runs.push(
      sameMembers && sameItems(was.own, own)
        ? was
        : {
            members,
            strokes: sameMembers ? was.strokes : strokesOf(members),
            own,
          },
    );
  }
  return sameItems(runs, previous) ? previous : runs;
};
