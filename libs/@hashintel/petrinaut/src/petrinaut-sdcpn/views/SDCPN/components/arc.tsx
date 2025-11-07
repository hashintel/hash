import { useMemo, useState } from "react";
import { type EdgeProps, getBezierPath } from "reactflow";

import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNStore } from "../../../state/sdcpn-provider";

interface ArcData {
  tokenWeights: {
    [tokenTypeId: string]: number;
  };
}

export const Arc: React.FC<EdgeProps<ArcData>> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Derive selected state from EditorStore
  const selectedItemIds = useEditorStore((state) => state.selectedItemIds);

  // Get SDCPN data to determine place type and color
  const sdcpn = useSDCPNStore((state) => state.sdcpn);

  // Check if this arc is selected by its ID
  const selected = selectedItemIds.has(id);

  // Determine which node is the place and get its type color
  const placeTypeColor = useMemo(() => {
    // Arcs connect places to transitions or transitions to places
    // We need to find which end is the place
    const sourcePlace = sdcpn.places.find((place) => place.id === source);
    const targetPlace = sdcpn.places.find((place) => place.id === target);

    const place = sourcePlace ?? targetPlace;

    if (!place || !place.type) {
      // No place or no type assigned - use neutral color
      return null;
    }

    // Find the type definition
    const typeDefinition = sdcpn.types.find((type) => type.id === place.type);

    return typeDefinition?.colorCode ?? null;
  }, [sdcpn.places, sdcpn.types, source, target]);

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
          transitionDuration: "0.2s",
          transitionTimingFunction: "ease",
        }}
      />

      <g transform={`translate(${labelX}, ${labelY})`}>
        {/* Show arc weights */}
        {Object.entries(data?.tokenWeights ?? {})
          .filter(([_, weight]) => weight > 0)
          .map(([_tokenTypeId, weight], index, nonZeroWeights) => {
            const yOffset = (index - (nonZeroWeights.length - 1) / 2) * 24;

            // Use type color if place has a type, otherwise neutral gray
            const outlineColor = placeTypeColor ?? "#999";
            const fillColor = "white";
            const textColor = "#333";

            return (
              <g key={_tokenTypeId} transform={`translate(0, ${yOffset})`}>
                {/* Square with colored outline */}
                <rect
                  x="-10"
                  y="-10"
                  width="20"
                  height="20"
                  fill={fillColor}
                  stroke={outlineColor}
                  strokeWidth="2"
                  rx="2"
                />
                {/* Weight number */}
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    fill: textColor,
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
