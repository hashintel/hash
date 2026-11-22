import { Fragment, memo } from "react";

import { ARC_STROKE_WIDTH } from "../arc-head";
import { ArcOwnStrokes } from "./arc-own-strokes";

import type { ArcRun, MergedStrokes } from "./arc-runs";

const line = {
  fill: "none",
  strokeWidth: ARC_STROKE_WIDTH,
} as const;

/**
 * The strokes of the arcs at rest of one run, one path per colour for each
 * thing an arc draws: the lines up to their heads, the whole lines again,
 * and the heads, which lie above the lines of their run. The pane fades the
 * three by their classes, as it fades an arc that draws its own.
 *
 * The lines are drawn twice because an arc's line is: where the browser
 * antialiases by coverage, the second stroke makes the edges heavier. A
 * faded line is drawn once, and stops where its head begins.
 */
const MergedStrokesComponent: React.FC<{
  strokes: readonly MergedStrokes[];
}> = ({ strokes }) => (
  <>
    {strokes.map(({ color, shafts, lines }) => (
      <Fragment key={color}>
        <path className="arc-shaft" d={shafts} stroke={color} {...line} />
        <path className="arc-line-twin" d={lines} stroke={color} {...line} />
      </Fragment>
    ))}
    {strokes.map(({ color, heads }) => (
      <path key={color} className="arc-head" d={heads} fill={color} />
    ))}
  </>
);

/**
 * Memoised by hand, as its run is. The strokes of a run are the same object
 * while its arcs at rest are, so a drag frame that moves an arc of the run
 * renders the run and not its merged paths.
 */
const MergedStrokesOfRun = memo(MergedStrokesComponent);

/**
 * One run of arcs: the merged strokes of its arcs at rest, then the strokes
 * of each of its arcs that draws its own, in the order of the document. A
 * run is drawn whole above the run before it.
 *
 * The first, empty group holds the pulses of the run's arcs at rest, under
 * their lines. Nothing here takes the pointer: each arc has an element of
 * its own for that, above every run.
 */
const ArcRunStrokesComponent: React.FC<{ run: ArcRun }> = ({ run }) => (
  <g className="arc-run" pointerEvents="none">
    <g className="arc-pulses" />
    <MergedStrokesOfRun strokes={run.strokes} />
    {run.own.map((shape) => (
      <ArcOwnStrokes key={shape.id} shape={shape} />
    ))}
  </g>
);

/**
 * Memoised by hand: the layer renders on every frame of a drag, and the
 * compiler does not skip the items of a list whose parent renders. A run
 * whose arcs draw the same is the same object.
 */
export const ArcRunStrokes = memo(ArcRunStrokesComponent);
