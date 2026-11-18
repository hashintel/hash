import { BaseEdge, type EdgeProps, useStoreApi } from "@xyflow/react";
import { type CSSProperties, useEffect, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useTransitionFrame } from "../../../canvas-frame-store";
import { useFiringDelta } from "../../../hooks/use-firing-delta";
import {
  ARC_HALO_OVERHANG,
  ARC_WHITE_OVERHANG,
  arcHaloColor,
} from "../../../styles/focus";
import { arcFiringIsVisible } from "./firing-animation-visibility";
import { fixedEndpoint, getOutlineArcPath } from "./shared/outline-arcs";

import type { ArcData, ArcEdgeType } from "./react-flow-types";

const BASE_STROKE_WIDTH = 2;
const ANIMATION_DURATION_MS = 500;
const READ_DASH_PATTERN = "2 6";
const INHIBITOR_MARKER_RADIUS = 10;
const INHIBITOR_MARKER_SIZE = (INHIBITOR_MARKER_RADIUS + BASE_STROKE_WIDTH) * 2;
const READ_MARKER_RADIUS = 4;
const READ_MARKER_SIZE = (READ_MARKER_RADIUS + BASE_STROKE_WIDTH) * 2;

// Perpendicular tick marks for inhibitor arcs
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
  // The viewport is read when a firing lands rather than subscribed to, so a
  // pan or a zoom does not re-render every arc on the canvas.
  const store = useStoreApi();

  useEffect(() => {
    // Only start a new animation when there's an actual firing (delta > 0)
    if (firingDelta === null || firingDelta <= 0 || pathRef.current === null) {
      return;
    }

    // The box the drawn path occupies, in flow units: a curve can sweep well
    // past its endpoints, so where it is drawn is what decides.
    const box = pathRef.current.getBBox();
    if (
      !arcFiringIsVisible(
        store.getState(),
        box.x,
        box.y,
        box.x + box.width,
        box.y + box.height,
      )
    ) {
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
  }, [firingDelta, pathRef, weight, store]);

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
  arcType: ArcData["kind"] | undefined,
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
 * derived from the rendered path by walking a detached path element with
 * `getPointAtLength`, so the ticks follow the curve. A margin is left at the
 * target end so the ticks do not collide with the inhibitor circle marker.
 *
 * This is a pure computation (the path element is never attached to the
 * document) and is safe to run during render.
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

  let totalLength: number;
  try {
    totalLength = pathElement.getTotalLength();
  } catch {
    // `getTotalLength`/`getPointAtLength` are unavailable in some non-browser
    // environments (e.g. jsdom); fall back to no ticks rather than throwing.
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
      x1: point.x - nx * INHIBITOR_TICK_HALF_LENGTH,
      y1: point.y - ny * INHIBITOR_TICK_HALF_LENGTH,
      x2: point.x + nx * INHIBITOR_TICK_HALF_LENGTH,
      y2: point.y + ny * INHIBITOR_TICK_HALF_LENGTH,
    });
  }

  return ticks;
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
  selected,
}) => {
  const inhibitorMarkerId = `inhibitor-circle-${id}`;
  const readMarkerId = `read-dot-${id}`;

  // Track firing count delta for simulation visualization
  const frame = useTransitionFrame(data?.transitionId ?? "");
  const firingDelta = useFiringDelta(frame?.firingCount ?? null);

  // Ref for the main arc path to animate stroke width
  const arcPathRef = useRef<SVGPathElement | null>(null);

  // Animate stroke width when firing delta changes (scaled by arc weight)
  useFiringAnimation(arcPathRef, firingDelta, data?.weight ?? 1);

  // An end at a subnet port has no outline: it starts at the port's handle
  // and leaves along the side the handle sits on, as the arc's preview did.
  const [arcPath, labelX, labelY] = getOutlineArcPath(
    data?.sourceOutline ?? fixedEndpoint(sourceX, sourceY, sourcePosition),
    data?.targetOutline ?? fixedEndpoint(targetX, targetY, targetPosition),
    data?.hasReverseArc,
  );

  const strokeColor = style?.stroke ?? "#b1b1b7";
  const arcType = data?.kind;
  const strokeDasharray = getArcStrokeDasharray(arcType);
  const haloColor = arcHaloColor(data?.focus ?? "none");

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

      {/*
        Everything that draws the arc, grouped so the pane can fade an arc
        outside the neighbourhood without fading the weight label below,
        which stays readable.
      */}
      <g className="arc-strokes">
        {/* Selection indicator: thick orange background stroke */}
        {selected && (
          <BaseEdge
            id={`${id}-selection`}
            path={arcPath}
            style={selectionIndicatorStyle}
          />
        )}

        {/* Focus casing: white around the arc's own stroke, the role's colour
            around that, both drawn beneath it so the arc keeps its token type's
            colour. Matches the bands a highlighted node wears. */}
        {haloColor !== undefined && (
          <>
            <path
              d={arcPath}
              fill="none"
              stroke={haloColor}
              strokeWidth={BASE_STROKE_WIDTH + ARC_HALO_OVERHANG * 2}
              strokeDasharray={strokeDasharray}
              strokeLinecap={arcType === "read" ? "round" : "butt"}
              style={{ pointerEvents: "none" }}
            />
            <path
              d={arcPath}
              fill="none"
              stroke="white"
              strokeWidth={BASE_STROKE_WIDTH + ARC_WHITE_OVERHANG * 2}
              strokeDasharray={strokeDasharray}
              strokeLinecap={arcType === "read" ? "round" : "butt"}
              style={{ pointerEvents: "none" }}
            />
          </>
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
      </g>

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
