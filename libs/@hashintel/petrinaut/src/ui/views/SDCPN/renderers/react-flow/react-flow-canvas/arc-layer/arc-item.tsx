import { memo } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { arcHaloColor } from "../../../../styles/focus";
import { ARC_STROKE_WIDTH, READ_ARC_DASH } from "../arc-head";
import { LineUnderlay } from "../shared/line-underlay";
import { computeArcTickMarks, INHIBITOR_CIRCLE_RADIUS } from "./arc-tick-marks";

import type { ArcShape } from "./arc-shapes";

const READ_DOT_RADIUS = 4;
/** How far before the end of its arc the circle or the dot is centred. */
const INHIBITOR_CIRCLE_SETBACK = INHIBITOR_CIRCLE_RADIUS - ARC_STROKE_WIDTH;
const READ_DOT_SETBACK = READ_DOT_RADIUS - ARC_STROKE_WIDTH;

const symbolTextStyle = css({
  fontSize: "[13px]",
  fontWeight: "normal",
  fill: "[#999]",
  pointerEvents: "none",
});

const weightTextStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  fill: "[#333]",
  pointerEvents: "none",
});

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
    pointerEvents: "none",
  } as const;

  return (
    <>
      <LineUnderlay
        path={paths.curve}
        selected={selected}
        haloColor={haloColor}
        strokeWidth={ARC_STROKE_WIDTH}
        strokeDasharray={undefined}
        strokeLinecap="butt"
      />
      <g className="arc-pulses" />
      <path className="arc-shaft" d={paths.shaft} {...line} />
      <path className="arc-line-twin" d={paths.curve} {...line} />
      {/*
        A cased arc runs into a head of the casing's colour: the casing
        cannot wrap the head, and a head left in the arc's own colour would
        end the casing short of the node.
      */}
      <path
        className="arc-head"
        d={paths.head}
        fill={haloColor ?? color}
        pointerEvents="none"
      />
    </>
  );
};

/**
 * What draws a read or an inhibitor arc. Its dot, or its circle and ticks,
 * lie on its line, so the pane can only fade it as one group.
 */
const MarkedStrokes: React.FC<{ shape: ArcShape }> = ({ shape }) => {
  const { paths, color, selected, kind, geometry } = shape;
  const isRead = kind === "read";
  const { end } = geometry.curve;
  const setback = isRead ? READ_DOT_SETBACK : INHIBITOR_CIRCLE_SETBACK;
  const mark = {
    cx: end.x - geometry.arrival.x * setback,
    cy: end.y - geometry.arrival.y * setback,
    pointerEvents: "none",
  } as const;
  const line = {
    d: paths.curve,
    fill: "none",
    stroke: color,
    strokeWidth: ARC_STROKE_WIDTH,
    strokeDasharray: isRead ? READ_ARC_DASH : undefined,
    strokeLinecap: isRead ? "round" : undefined,
    pointerEvents: "none",
  } as const;
  const tickMarks = isRead ? [] : computeArcTickMarks(paths.curve);

  return (
    <g className="arc-strokes">
      <LineUnderlay
        path={paths.curve}
        selected={selected}
        haloColor={arcHaloColor(shape.focus)}
        strokeWidth={ARC_STROKE_WIDTH}
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
          pointerEvents="none"
        />
      ))}
    </g>
  );
};

/** The weight of an arc, on a white box at the middle of its curve. */
const WeightLabel: React.FC<{ shape: ArcShape }> = ({ shape }) => (
  <g
    transform={`translate(${shape.geometry.label.x}, ${shape.geometry.label.y})`}
  >
    <rect
      x="-16"
      y="-10"
      width="32"
      height="20"
      fill="white"
      stroke="#ddd"
      strokeWidth="1"
      rx="3"
    />
    <text
      x="-6"
      y="0"
      textAnchor="middle"
      dominantBaseline="middle"
      className={symbolTextStyle}
    >
      ×
    </text>
    <text
      x="6"
      y="0"
      textAnchor="middle"
      dominantBaseline="middle"
      className={weightTextStyle}
    >
      {shape.weight}
    </text>
  </g>
);

type ArcItemProps = {
  shape: ArcShape;
  /** Whether a click can select the arc: not while a node is being added. */
  selectable: boolean;
  /** The id of React Flow's description of an edge, for a screen reader. */
  describedBy: string;
};

/**
 * One arc on the page: the element that takes the keyboard focus and the
 * pointer for it, with the name and the classes React Flow gives an edge,
 * and what draws it.
 *
 * The pointer goes to the last path of the group, which is not painted: the
 * arc's curve, 20 units wide, as in an edge of React Flow. Where several
 * arcs are within reach the browser takes the last in the document. Nothing
 * that is painted takes the pointer, so a pulse of any width leaves the pane
 * beside its arc pressable. The weight's box is the exception React Flow's
 * edges had: its border is part of the arc.
 */
const ArcItemComponent: React.FC<ArcItemProps> = ({
  shape,
  selectable,
  describedBy,
}) => (
  <g
    className={[
      "arc-item react-flow__edge react-flow__edge-default nopan",
      selectable ? "selectable" : null,
      shape.selected ? "selected" : null,
      // Only an arc carrying a role is marked, so the pane can fade the rest
      // without touching them.
      shape.focus === "none" ? null : "canvas-focus-role",
    ]
      .filter(Boolean)
      .join(" ")}
    tabIndex={0}
    role="group"
    aria-roledescription="edge"
    aria-label={`Edge from ${shape.sourceId} to ${shape.targetId}`}
    aria-describedby={describedBy}
    data-id={shape.id}
    data-testid={`rf__edge-${shape.id}`}
  >
    {shape.kind === "standard" ? (
      <StandardStrokes shape={shape} />
    ) : (
      <MarkedStrokes shape={shape} />
    )}
    <path
      className="react-flow__edge-interaction"
      d={shape.paths.curve}
      fill="none"
      strokeOpacity={0}
      strokeWidth={20}
    />
    {shape.weight > 1 ? <WeightLabel shape={shape} /> : null}
  </g>
);

/**
 * Memoised by hand: the layer renders on every frame of a drag with one
 * element per arc, and the compiler does not skip the items of a list whose
 * parent renders. An arc that draws the same has the same shape object.
 */
export const ArcItem = memo(ArcItemComponent);
