import { memo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { arcHaloColor, focusRoleClass } from "../../../../../styles/focus";
import { ARC_STROKE_WIDTH, READ_ARC_DASH } from "../../arc-head";
import { LineUnderlay } from "../../shared/line-underlay";

import type { ArcShape } from "../arc-shapes";

const INHIBITOR_CIRCLE_RADIUS = 10;
const READ_DOT_RADIUS = 4;
/** How far before the end of its arc the circle or the dot is centred. */
const INHIBITOR_CIRCLE_SETBACK = INHIBITOR_CIRCLE_RADIUS - ARC_STROKE_WIDTH;
const READ_DOT_SETBACK = READ_DOT_RADIUS - ARC_STROKE_WIDTH;

const tickSpacing = 13;
const tickHalfLength = 5;

type TickMark = { x1: number; y1: number; x2: number; y2: number };

/**
 * The crossed line of an inhibitor arc: marks across its path at an even
 * spacing, clear of the source node and of the circle at the target. They
 * follow the curve as the browser draws it, read from a path element that is
 * never attached to the document, so this is safe during render.
 */
const computeArcTickMarks = (path: string): TickMark[] => {
  if (typeof document === "undefined") {
    return [];
  }

  const pathElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  pathElement.setAttribute("d", path);

  let totalLength: number;
  try {
    totalLength = pathElement.getTotalLength();
  } catch {
    // jsdom has no `getTotalLength` or `getPointAtLength`.
    return [];
  }

  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    return [];
  }

  const startMargin = tickSpacing;
  const endMargin = INHIBITOR_CIRCLE_RADIUS + ARC_STROKE_WIDTH + tickSpacing;
  const usableLength = totalLength - startMargin - endMargin;

  if (usableLength <= 0) {
    return [];
  }

  const tickCount = Math.floor(usableLength / tickSpacing);
  const ticks: TickMark[] = [];

  for (let index = 0; index <= tickCount; index++) {
    const distance = startMargin + index * tickSpacing;

    let point: DOMPoint;
    let ahead: DOMPoint;
    try {
      point = pathElement.getPointAtLength(distance);
      ahead = pathElement.getPointAtLength(Math.min(distance + 1, totalLength));
    } catch {
      return [];
    }

    const dx = ahead.x - point.x;
    const dy = ahead.y - point.y;
    const length = Math.hypot(dx, dy) || 1;

    // Unit vector perpendicular to the path tangent.
    const nx = -dy / length;
    const ny = dx / length;

    ticks.push({
      x1: point.x - nx * tickHalfLength,
      y1: point.y - ny * tickHalfLength,
      x2: point.x + nx * tickHalfLength,
      y2: point.y + ny * tickHalfLength,
    });
  }

  return ticks;
};

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

/** Memoised by hand, as `ArcLayer` says. */
export const ArcOwnStrokes = memo(ArcOwnStrokesComponent);
