import { getBezierPath, type Position } from "reactflow";

interface ArcProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
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
  data,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: {
    tokenWeights: {
      [tokenTypeId: string]: number;
    };
  };
}) => {
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
        stroke="#555"
        style={{
          cursor: "pointer",
          strokeOpacity: 0.1,
        }}
      />
      <path
        id={`${id}-visible`}
        className="react-flow__edge-path"
        d={arcPath}
        fill="none"
        strokeWidth={2}
        stroke="#555"
        style={{ pointerEvents: "none" }}
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
