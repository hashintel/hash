import { useMemo } from "react";
import { BaseEdge, type EdgeProps, getBezierPath } from "reactflow";

import { useEditorStore } from "../../../state/editor-provider";

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
  // Derive selected state from EditorStore
  const selectedItemIds = useEditorStore((state) => state.selectedItemIds);

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

  // Override style for selected arcs
  const edgeStyle = useMemo(() => {
    if (selected) {
      return {
        ...style,
        stroke: "#3b82f6",
        strokeWidth: 3,
      };
    }
    return style;
  }, [selected, style]);

  return (
    <>
      {/* Use BaseEdge to properly render with markerEnd and style */}
      <BaseEdge
        id={id}
        path={arcPath}
        markerEnd={markerEnd}
        style={edgeStyle}
      />

      {/* Weight label */}
      <g transform={`translate(${labelX}, ${labelY})`}>
        {Object.entries(data?.tokenWeights ?? {})
          .filter(([_, weight]) => weight > 0)
          .map(([_tokenTypeId, weight], index, nonZeroWeights) => {
            const yOffset = (index - (nonZeroWeights.length - 1) / 2) * 24;

            return (
              <g key={_tokenTypeId} transform={`translate(0, ${yOffset})`}>
                {/* White background for readability */}
                <rect
                  x="-12"
                  y="-10"
                  width="24"
                  height="20"
                  fill="white"
                  stroke="#ddd"
                  strokeWidth="1"
                  rx="3"
                />
                {/* Weight number */}
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    fill: "#333",
                    pointerEvents: "none",
                  }}
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
