import { css } from "@hashintel/ds-helpers/css";
import { type CSSProperties, use } from "react";
import { BaseEdge, type EdgeProps, getBezierPath } from "reactflow";

import { EditorContext } from "../../../state/editor-context";

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

interface ArcData {
  tokenWeights: {
    [tokenTypeId: string]: number;
  };
}

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

      {/* Weight label - only show for weights > 1 */}
      <g transform={`translate(${labelX}, ${labelY})`}>
        {Object.entries(data?.tokenWeights ?? {})
          .filter(([_, weight]) => weight > 1)
          .map(([_tokenTypeId, weight], index, nonZeroWeights) => {
            const yOffset = (index - (nonZeroWeights.length - 1) / 2) * 24;

            return (
              <g key={_tokenTypeId} transform={`translate(0, ${yOffset})`}>
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
                  {weight}
                </text>
              </g>
            );
          })}
      </g>
    </>
  );
};
