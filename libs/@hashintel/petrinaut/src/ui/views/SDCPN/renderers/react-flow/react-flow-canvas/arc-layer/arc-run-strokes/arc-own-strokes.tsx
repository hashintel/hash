import { memo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { arcHaloColor, focusRoleClass } from "../../../../../styles/focus";
import { ARC_STROKE_WIDTH, READ_ARC_DASH } from "../../arc-head";
import { LineUnderlay } from "../../shared/line-underlay";
import {
  computeArcTickMarks,
  INHIBITOR_CIRCLE_RADIUS,
} from "./arc-own-strokes/arc-tick-marks";

import type { ArcShape } from "../arc-shapes";

const READ_DOT_RADIUS = 4;
/** How far before the end of its arc the circle or the dot is centred. */
const INHIBITOR_CIRCLE_SETBACK = INHIBITOR_CIRCLE_RADIUS - ARC_STROKE_WIDTH;
const READ_DOT_SETBACK = READ_DOT_RADIUS - ARC_STROKE_WIDTH;

/**
 * What draws a standard arc: its casing, the line up to the head, the whole
 * line again and the head. The pane fades the three by their classes. The
 * empty group holds the arc's pulse while its transition fires.
 */
const StandardStrokes: React.FC<{ shape: ArcShape }> = ({ shape }) => {
  const { paths, color, selected } = shape;
  const haloColor = arcHaloColor(shape.focus);
  const line = {
    fill: "none",
    stroke: color,
    strokeWidth: ARC_STROKE_WIDTH,
  } as const;

  return (
    <>
      <LineUnderlay
        path={paths.curve}
        selected={selected}
        haloColor={haloColor}
        strokeLinecap="butt"
      />
      <g className="arc-pulses" />
      <path className="arc-shaft" d={paths.shaft} {...line} />
      <path className="arc-line" d={paths.curve} {...line} />
      {/*
        A cased arc runs into a head of the casing's colour: the casing
        cannot wrap the head, and a head left in the arc's own colour would
        end the casing short of the node.
      */}
      <path className="arc-head" d={paths.head} fill={haloColor ?? color} />
    </>
  );
};

/**
 * What draws a read or an inhibitor arc. Its dot, or its circle and ticks,
 * lie on its line, so the pane can only fade it whole, by the opacity of the
 * group around it.
 */
const MarkedStrokes: React.FC<{ shape: ArcShape }> = ({ shape }) => {
  const { paths, color, selected, kind, geometry } = shape;
  const isRead = kind === "read";
  const { end } = geometry.curve;
  const setback = isRead ? READ_DOT_SETBACK : INHIBITOR_CIRCLE_SETBACK;
  const mark = {
    cx: end.x - geometry.arrival.x * setback,
    cy: end.y - geometry.arrival.y * setback,
  };
  const line = {
    d: paths.curve,
    fill: "none",
    stroke: color,
    strokeWidth: ARC_STROKE_WIDTH,
    strokeDasharray: isRead ? READ_ARC_DASH : undefined,
    strokeLinecap: isRead ? "round" : undefined,
  } as const;
  const tickMarks = isRead ? [] : computeArcTickMarks(paths.curve);

  return (
    <>
      <LineUnderlay
        path={paths.curve}
        selected={selected}
        haloColor={arcHaloColor(shape.focus)}
        strokeDasharray={line.strokeDasharray}
        strokeLinecap={isRead ? "round" : "butt"}
      />
      <g className="arc-pulses" />
      {/*
        Twice, as a standard arc's line is drawn: where the browser
        antialiases by coverage, the second stroke makes the edges heavier.
      */}
      <path {...line} />
      <path {...line} />
      {isRead ? (
        <circle {...mark} r={READ_DOT_RADIUS} fill={color} />
      ) : (
        <circle
          {...mark}
          r={INHIBITOR_CIRCLE_RADIUS}
          fill="white"
          stroke={color}
          strokeWidth={ARC_STROKE_WIDTH}
        />
      )}
      {tickMarks.map((tick, index) => (
        <line
          // eslint-disable-next-line react/no-array-index-key -- ticks are derived purely from path geometry and re-rendered as a whole
          key={index}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke={color}
          strokeWidth={ARC_STROKE_WIDTH}
          strokeLinecap="round"
        />
      ))}
    </>
  );
};

/**
 * The strokes of an arc that draws its own, in one group named after the
 * arc. The group says whether the arc has a focus role, which is how the
 * pane tells the strokes it fades from those it leaves. A read or an
 * inhibitor arc is faded by this group, as `arc-strokes`.
 *
 * It lies inside its run, which takes no pointer: the arc's own element
 * does that.
 */
const ArcOwnStrokesComponent: React.FC<{ shape: ArcShape }> = ({ shape }) => (
  <g
    className={cx(
      "arc-own",
      shape.kind !== "standard" && "arc-strokes",
      shape.focus !== "none" && focusRoleClass,
    )}
    data-arc={shape.id}
  >
    {shape.kind === "standard" ? (
      <StandardStrokes shape={shape} />
    ) : (
      <MarkedStrokes shape={shape} />
    )}
  </g>
);

/**
 * Memoised by hand: a run renders on every frame of a drag that moves one of
 * its arcs, and the compiler does not skip the items of a list whose parent
 * renders. An arc that draws the same has the same shape object.
 */
export const ArcOwnStrokes = memo(ArcOwnStrokesComponent);
