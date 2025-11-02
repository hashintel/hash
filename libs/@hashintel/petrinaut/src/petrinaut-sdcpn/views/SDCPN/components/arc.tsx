import { useState } from "react";
import { getBezierPath, type Position } from "reactflow";

interface ArcProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  selected?: boolean;
  data?: {
    tokenWeights: {
      [tokenTypeId: string]: number;
    };
  };
}

export const Arc: React.FC<ArcProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected = false,
  data,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  selected?: boolean;
  data?: {
    tokenWeights: {
      [tokenTypeId: string]: number;
    };
  };
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Use a default token type for now
  const defaultTokenType = {
    id: "default",
    name: "Token",
    color: "#4A90E2",
  };

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
      <path
        id={id}
        className="react-flow__edge-path"
        d={arcPath}
        fill="none"
        strokeWidth={20}
        stroke={selected ? "#3b82f6" : "#555"}
        style={{
          cursor: "pointer",
          strokeOpacity: isHovered
            ? selected
              ? 0.3
              : 0.2
            : selected
              ? 0.2
              : 0.1,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <path
        id={`${id}-visible`}
        className="react-flow__edge-path"
        d={arcPath}
        fill="none"
        strokeWidth={selected ? 3 : 2}
        stroke={selected ? "#3b82f6" : "#555"}
        style={{
          pointerEvents: "none",
          transitionProperty: "stroke-width, stroke",
          transition: "all 0.2s ease",
        }}
      />

      <g transform={`translate(${labelX}, ${labelY})`}>
        {/* Show tokens required or produced */}
        {Object.entries(data?.tokenWeights ?? {})
          .filter(([_, weight]) => weight > 0)
          .map(([tokenTypeId, weight], index, nonZeroWeights) => {
            // Use default token type for now
            const tokenType = defaultTokenType;

            const yOffset = (index - (nonZeroWeights.length - 1) / 2) * 20;

            return (
              <g key={tokenTypeId} transform={`translate(0, ${yOffset})`}>
                <circle cx="0" cy="0" r="10" fill={tokenType.color} />
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    fill: "white",
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
