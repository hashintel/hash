import { css } from "@hashintel/ds-helpers/css";
import { type CSSProperties, use, useEffect, useRef } from "react";
import { BaseEdge, type EdgeProps, getBezierPath } from "reactflow";

import { EditorContext } from "../../../state/editor-context";
import { useFiringDelta } from "../hooks/use-firing-delta";
import type { ArcData } from "../reactflow-types";

const BASE_STROKE_WIDTH = 2;
const ANIMATION_DURATION_MS = 500;

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
    const peakStrokeWidth =
      BASE_STROKE_WIDTH + Math.log(1 + transitionsToAnimate) * 6 * weight;

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
  fontWeight: "[400]",
  fill: "[#999]",
  pointerEvents: "none",
});

const weightTextStyle = css({
  fontSize: "[14px]",
  fontWeight: "[600]",
  fill: "[#333]",
  pointerEvents: "none",
});

export const Arc: React.FC<EdgeProps<ArcData>> = ({
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
  const { selectedItemIds } = use(EditorContext);

  // Check if this arc is selected by its ID
  const selected = selectedItemIds.has(id);

  // Track firing count delta for simulation visualization
  const firingDelta = useFiringDelta(data?.frame?.firingCount ?? null);

  // Ref for the main arc path to animate stroke width
  const arcPathRef = useRef<SVGPathElement | null>(null);

  // Animate stroke width when firing delta changes (scaled by arc weight)
  useFiringAnimation(arcPathRef, firingDelta, data?.weight ?? 1);

  const [arcPath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* Selection indicator: thick orange background stroke */}
      {selected && (
        <BaseEdge
          id={`${id}-selection`}
          path={arcPath}
          style={selectionIndicatorStyle}
        />
      )}

      {/* Main edge with marker - using BaseEdge for proper interaction handling */}
      <BaseEdge id={id} path={arcPath} markerEnd={markerEnd} style={style} />

      {/* Animated overlay path for firing visualization (no marker) */}
      <path
        ref={arcPathRef}
        d={arcPath}
        fill="none"
        stroke={style?.stroke ?? "#b1b1b7"}
        strokeWidth={BASE_STROKE_WIDTH}
        style={{ pointerEvents: "none" }}
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
