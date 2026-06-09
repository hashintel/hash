import {
  BaseEdge,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  type Position,
} from "@xyflow/react";
import { type CSSProperties, use, useEffect, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../react/state/editor-context";
import { UserSettingsContext } from "../../../../react/state/user-settings-context";
import { useFiringDelta } from "../hooks/use-firing-delta";

import type { ArcData, ArcEdgeType } from "../reactflow-types";

const BASE_STROKE_WIDTH = 2;
const ANIMATION_DURATION_MS = 500;
const READ_DASH_PATTERN = "2 6";
const INHIBITOR_MARKER_RADIUS = 10;
const INHIBITOR_MARKER_SIZE = (INHIBITOR_MARKER_RADIUS + BASE_STROKE_WIDTH) * 2;
const READ_MARKER_RADIUS = 4;
const READ_MARKER_SIZE = (READ_MARKER_RADIUS + BASE_STROKE_WIDTH) * 2;

// Inhibitor arcs are drawn as a solid line crossed by evenly spaced
// perpendicular tick marks (a "barrier" look) to set them clearly apart from
// the sparse dotted read arc.
const INHIBITOR_TICK_SPACING = 13;
const INHIBITOR_TICK_HALF_LENGTH = 5;

type AnimationState = {
  animation: Animation;
  startTime: number;
  transitionsAnimating: number;
};

/**
 * Hook to animate stroke width when firing delta changes.
 * Creates a "pulse" effect on the arc when transitions fire.
 *
 * The animation accumulates: if a new firing occurs while an animation is
 * in progress, we calculate the remaining stroke width from the previous
 * animation and add it to the new one for smooth visual continuity.
 */
function useFiringAnimation(
  pathRef: React.RefObject<SVGPathElement | null>,
  firingDelta: number | null,
  weight: number,
): void {
  const animationStateRef = useRef<AnimationState | null>(null);

  useEffect(() => {
    // Only start a new animation when there's an actual firing (delta > 0)
    if (firingDelta === null || firingDelta <= 0 || pathRef.current === null) {
      return;
    }

    let transitionsToAnimate = firingDelta;

    // Calculate remaining transitions from previous animation (if any)
    if (animationStateRef.current) {
      const { animation, startTime, transitionsAnimating } =
        animationStateRef.current;
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);

      // Remaining transitions decrease linearly as animation progresses
      const remainingTransitions = transitionsAnimating * (1 - progress);
      transitionsToAnimate += remainingTransitions;

      // Cancel the previous animation
      animation.cancel();
    }

    const path = pathRef.current;

    // Stroke width based on total transitions
    const peakStrokeWidth = Math.min(
      65,
      BASE_STROKE_WIDTH +
        Math.log(1 + transitionsToAnimate) * Math.min(6 * weight, 25),
    );

    const animation = path.animate(
      [
        { strokeWidth: `${peakStrokeWidth}px` },
        { strokeWidth: `${BASE_STROKE_WIDTH}px` },
      ],
      {
        duration: ANIMATION_DURATION_MS,
        easing: "ease-out",
        fill: "forwards",
      },
    );

    // Store total transitions for calculating remaining stroke width later
    animationStateRef.current = {
      animation,
      startTime: performance.now(),
      transitionsAnimating: transitionsToAnimate,
    };

    // Clean up animation reference when it finishes
    animation.onfinish = () => {
      if (animationStateRef.current?.animation === animation) {
        animationStateRef.current = null;
      }
    };
  }, [firingDelta, pathRef, weight]);

  // Cancel animation on unmount
  useEffect(() => {
    return () => {
      if (animationStateRef.current) {
        animationStateRef.current.animation.cancel();
        animationStateRef.current = null;
      }
    };
  }, []);
}

const selectionIndicatorStyle: CSSProperties = {
  stroke: "rgba(249, 115, 22, 0.4)",
  strokeWidth: 8,
};

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

function getArcStrokeDasharray(
  arcType: ArcData["arcType"] | undefined,
): string | undefined {
  if (arcType === "read") {
    return READ_DASH_PATTERN;
  }
  return undefined;
}

type TickMark = { x1: number; y1: number; x2: number; y2: number };

/**
 * Computes evenly spaced perpendicular tick marks along an SVG path.
 *
 * Used to render the inhibitor arc as a crossed "barrier" line. The geometry is
 * derived from the actual rendered path (bezier, smoothstep, or custom) by
 * walking a detached path element with `getPointAtLength`, so the ticks follow
 * whichever arc rendering the user has selected. A margin is left at the target
 * end so the ticks do not collide with the inhibitor circle marker.
 *
 * This is a pure computation (the path element is never attached to the
 * document) and is safe to run during render; the React Compiler memoizes it on
 * `path`.
 */
function computeArcTickMarks(path: string): TickMark[] {
  if (typeof document === "undefined") {
    return [];
  }

  const pathElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  pathElement.setAttribute("d", path);

  // `getTotalLength`/`getPointAtLength` are unavailable in some non-browser
  // environments (e.g. jsdom); fall back to no ticks rather than throwing.
  let totalLength: number;
  try {
    totalLength = pathElement.getTotalLength();
  } catch {
    return [];
  }

  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    return [];
  }

  // Keep ticks clear of the source node and of the circle marker at the target.
  const startMargin = INHIBITOR_TICK_SPACING;
  const endMargin = INHIBITOR_MARKER_SIZE / 2 + INHIBITOR_TICK_SPACING;
  const usableLength = totalLength - startMargin - endMargin;

  if (usableLength <= 0) {
    return [];
  }

  const tickCount = Math.floor(usableLength / INHIBITOR_TICK_SPACING);
  const ticks: TickMark[] = [];

  for (let index = 0; index <= tickCount; index++) {
    const distance = startMargin + index * INHIBITOR_TICK_SPACING;
    const point = pathElement.getPointAtLength(distance);
    const ahead = pathElement.getPointAtLength(
      Math.min(distance + 1, totalLength),
    );

    const dx = ahead.x - point.x;
    const dy = ahead.y - point.y;
    const length = Math.hypot(dx, dy) || 1;

    // Unit vector perpendicular to the path tangent.
    const nx = -dy / length;
    const ny = dx / length;

    ticks.push({
      x1: point.x - nx * INHIBITOR_TICK_HALF_LENGTH,
      y1: point.y - ny * INHIBITOR_TICK_HALF_LENGTH,
      x2: point.x + nx * INHIBITOR_TICK_HALF_LENGTH,
      y2: point.y + ny * INHIBITOR_TICK_HALF_LENGTH,
    });
  }

  return ticks;
}

/**
 * Custom cubic bezier path between two points.
 * Control point offsets are proportional to the horizontal distance
 * so arcs stay tight for nearby nodes and sweep wide for distant ones.
 */
function getCustomArcPath({
  sourceX,
  sourceY,
  sourcePosition: _sourcePosition,
  targetX,
  targetY,
  targetPosition: _targetPosition,
}: {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
}): [path: string, labelX: number, labelY: number] {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  // Control point offset scales with horizontal distance, with a minimum
  const offset = Math.max(Math.abs(dx) * 0.7, 80);

  const cp1x = sourceX + offset / 2;
  const cp1y = sourceY;
  const cp2x = targetX - offset;
  const cp2y = targetY;

  const path = `M ${sourceX},${sourceY} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${targetX},${targetY}`;

  // Label at the midpoint of the cubic bezier (t=0.5)
  const labelX = sourceX + dx / 2;
  const labelY = sourceY + dy / 2;

  return [path, labelX, labelY];
}

export const Arc: React.FC<EdgeProps<ArcEdgeType>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}) => {
  // Derive selected state from EditorContext
  const { isSelected } = use(EditorContext);
  const { arcRendering } = use(UserSettingsContext);

  // Check if this arc is selected by its ID
  const selected = isSelected(id);

  const inhibitorMarkerId = `inhibitor-circle-${id}`;
  const readMarkerId = `read-dot-${id}`;

  // Track firing count delta for simulation visualization
  const firingDelta = useFiringDelta(data?.frame?.firingCount ?? null);

  // Ref for the main arc path to animate stroke width
  const arcPathRef = useRef<SVGPathElement | null>(null);

  // Animate stroke width when firing delta changes (scaled by arc weight)
  useFiringAnimation(arcPathRef, firingDelta, data?.weight ?? 1);

  // Compute path based on arc rendering setting.

  const [arcPath, labelX, labelY] =
    arcRendering === "smoothstep"
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
        })
      : arcRendering === "bezier"
        ? getBezierPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
          })
        : getCustomArcPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
          });

  let strokeColor = style?.stroke ?? "#b1b1b7";
  const arcType = data?.arcType;
  const strokeDasharray = getArcStrokeDasharray(arcType);

  const tickMarks = arcType === "inhibitor" ? computeArcTickMarks(arcPath) : [];
  const markerEndOverride =
    arcType === "inhibitor"
      ? `url(#${inhibitorMarkerId})`
      : arcType === "read"
        ? `url(#${readMarkerId})`
        : markerEnd;

  return (
    <>
      {(arcType === "inhibitor" || arcType === "read") && (
        <defs>
          {arcType === "inhibitor" ? (
            <marker
              id={inhibitorMarkerId}
              markerWidth={INHIBITOR_MARKER_SIZE}
              markerHeight={INHIBITOR_MARKER_SIZE}
              refX={INHIBITOR_MARKER_RADIUS * 2}
              refY={INHIBITOR_MARKER_RADIUS + BASE_STROKE_WIDTH}
              orient="auto"
              markerUnits="userSpaceOnUse"
              style={{ zIndex: 1 }}
            >
              <circle
                cx={INHIBITOR_MARKER_RADIUS + BASE_STROKE_WIDTH}
                cy={INHIBITOR_MARKER_RADIUS + BASE_STROKE_WIDTH}
                r={INHIBITOR_MARKER_RADIUS}
                fill="white"
                stroke={strokeColor}
                strokeWidth={BASE_STROKE_WIDTH}
              />
            </marker>
          ) : (
            <marker
              id={readMarkerId}
              markerWidth={READ_MARKER_SIZE}
              markerHeight={READ_MARKER_SIZE}
              refX={READ_MARKER_RADIUS * 2}
              refY={READ_MARKER_RADIUS + BASE_STROKE_WIDTH}
              orient="auto"
              markerUnits="userSpaceOnUse"
              style={{ zIndex: 1 }}
            >
              <circle
                cx={READ_MARKER_RADIUS + BASE_STROKE_WIDTH}
                cy={READ_MARKER_RADIUS + BASE_STROKE_WIDTH}
                r={READ_MARKER_RADIUS}
                fill={strokeColor}
              />
            </marker>
          )}
        </defs>
      )}

      {/* Selection indicator: thick orange background stroke */}
      {selected && (
        <BaseEdge
          id={`${id}-selection`}
          path={arcPath}
          style={selectionIndicatorStyle}
        />
      )}

      {/* Animated overlay path for firing visualization (no marker). */}
      <path
        ref={arcPathRef}
        d={arcPath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={BASE_STROKE_WIDTH}
        strokeDasharray={strokeDasharray}
        strokeLinecap={arcType === "read" ? "round" : undefined}
        style={{ pointerEvents: "none" }}
      />

      {/* Main edge with marker - using BaseEdge for proper interaction handling */}
      <BaseEdge
        id={id}
        path={arcPath}
        markerEnd={markerEndOverride}
        style={
          strokeDasharray
            ? {
                ...style,
                strokeDasharray,
                strokeLinecap: arcType === "read" ? "round" : undefined,
                stroke: strokeColor,
              }
            : { ...style, stroke: strokeColor }
        }
      />

      {/* Perpendicular tick marks crossing inhibitor arcs */}
      {arcType === "inhibitor" && tickMarks.length > 0 && (
        <g style={{ pointerEvents: "none" }}>
          {tickMarks.map((tick, index) => (
            <line
              // eslint-disable-next-line react/no-array-index-key -- ticks are derived purely from path geometry and re-rendered as a whole
              key={index}
              x1={tick.x1}
              y1={tick.y1}
              x2={tick.x2}
              y2={tick.y2}
              stroke={strokeColor}
              strokeWidth={BASE_STROKE_WIDTH}
              strokeLinecap="round"
            />
          ))}
        </g>
      )}

      {/* Labels container */}
      <g transform={`translate(${labelX}, ${labelY})`}>
        {/* Weight label - always show for weights > 1 */}
        {data && data.weight > 1 ? (
          <g>
            {/* White background for readability */}
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
            {/* Multiplication symbol (grayed out) */}
            <text
              x="-6"
              y="0"
              textAnchor="middle"
              dominantBaseline="middle"
              className={symbolTextStyle}
            >
              ×
            </text>
            {/* Weight number */}
            <text
              x="6"
              y="0"
              textAnchor="middle"
              dominantBaseline="middle"
              className={weightTextStyle}
            >
              {data.weight}
            </text>
          </g>
        ) : null}
      </g>
    </>
  );
};
