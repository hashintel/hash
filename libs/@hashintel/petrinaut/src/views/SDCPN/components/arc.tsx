import { css } from "@hashintel/ds-helpers/css";
import {
  BaseEdge,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  type Position,
} from "@xyflow/react";
import { type CSSProperties, use, useEffect, useRef } from "react";

import { EditorContext } from "../../../state/editor-context";
import { UserSettingsContext } from "../../../state/user-settings-context";
import { useFiringDelta } from "../hooks/use-firing-delta";
import type { ArcEdgeType } from "../reactflow-types";

const BASE_STROKE_WIDTH = 2;
const ANIMATION_DURATION_MS = 500;
const INHIBITOR_DASH_PATTERN = "10 5 3 3 3 5";
const INHIBITOR_MARKER_RADIUS = 10;
const INHIBITOR_MARKER_SIZE = (INHIBITOR_MARKER_RADIUS + BASE_STROKE_WIDTH) * 2;

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

  // Track firing count delta for simulation visualization
  const firingDelta = useFiringDelta(data?.frame?.firingCount ?? null);

  // Ref for the main arc path to animate stroke width
  const arcPathRef = useRef<SVGPathElement | null>(null);

  // Animate stroke width when firing delta changes (scaled by arc weight)
  useFiringAnimation(arcPathRef, firingDelta, data?.weight ?? 1);

  // Compute path based on arc rendering setting
  let arcPath: string;
  let labelX: number;
  let labelY: number;

  if (arcRendering === "smoothstep") {
    [arcPath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  } else if (arcRendering === "bezier") {
    [arcPath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  } else {
    [arcPath, labelX, labelY] = getCustomArcPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  let strokeColor = style?.stroke ?? "#b1b1b7";

  return (
    <>
      {/* Custom SVG marker definition for inhibitor arcs (empty circle) */}
      {data?.arcType === "inhibitor" && (
        <defs>
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
        strokeDasharray={
          data?.arcType === "inhibitor" ? INHIBITOR_DASH_PATTERN : undefined
        }
        style={{ pointerEvents: "none" }}
      />

      {/* Main edge with marker - using BaseEdge for proper interaction handling */}
      <BaseEdge
        id={id}
        path={arcPath}
        markerEnd={
          data?.arcType === "inhibitor"
            ? `url(#${inhibitorMarkerId})`
            : markerEnd
        }
        style={
          data?.arcType === "inhibitor"
            ? {
                ...style,
                strokeDasharray: INHIBITOR_DASH_PATTERN,
                stroke: strokeColor,
              }
            : { ...style, stroke: strokeColor }
        }
      />

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
