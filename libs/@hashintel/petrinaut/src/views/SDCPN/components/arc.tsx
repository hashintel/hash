import { css } from "@hashintel/ds-helpers/css";
import { type CSSProperties, use, useEffect, useRef } from "react";
import { BaseEdge, type EdgeProps, getBezierPath } from "reactflow";

import { EditorContext } from "../../../state/editor-context";
import type { ArcData } from "../reactflow-types";

type FiringDelta = { delta: number; sign: string };

/**
 * Hook to track the previous firingCount and compute the delta.
 * Returns the delta and sign symbol when firingCount changes.
 */
function useFiringDelta(firingCount: number | null): FiringDelta | null {
  const prevFiringCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (firingCount !== null) {
      prevFiringCountRef.current = firingCount;
    }
  }, [firingCount]);

  if (firingCount === null) {
    return null;
  }

  const prevCount = prevFiringCountRef.current ?? 0;
  const delta = firingCount - prevCount;

  return {
    delta: Math.abs(delta),
    sign: delta >= 0 ? "+" : "−",
  };
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
  const firingDelta = useFiringDelta(data?.firingCount ?? null);

  console.log("firingDelta", firingDelta);

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

      {/* Main edge with original style */}
      <BaseEdge id={id} path={arcPath} markerEnd={markerEnd} style={style} />

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
