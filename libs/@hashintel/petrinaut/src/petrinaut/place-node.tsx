import { IconDiagramRegular } from "@hashintel/design-system";
import { Box, Tooltip } from "@mui/material";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorContext } from "./editor-context";
import { useSimulationContext } from "./simulation-context";
import { handleStyling, nodeDimensions, placeStyling } from "./styling";
import type { PlaceNodeData } from "./types";

const tokenSize = 22;
const halfTokenSize = tokenSize / 2;

const getTokenPosition = (index: number) => {
  // Calculate the angle for this token (in radians), starting from top (-π/2), distributed to fit 16 tokens evenly around the place border
  const angle = (index * 2 * Math.PI) / 16 - Math.PI / 2;

  const radius = nodeDimensions.place.width / 2;

  return {
    left: `calc(50% + ${radius * Math.cos(angle)}px - ${halfTokenSize}px)`,
    top: `calc(50% + ${radius * Math.sin(angle)}px - ${halfTokenSize}px + 1px)`,
  };
};

export const PlaceNode = ({
  data,
  id,
  isConnectable,
}: NodeProps<PlaceNodeData>) => {
  const { placeMarkingsById } = useSimulationContext();
  const { petriNetDefinition } = useEditorContext();

  const currentTokenCounts = placeMarkingsById[id] ?? {};

  const nonZeroTokens = Object.entries(currentTokenCounts).filter(
    ([_, count]) => count > 0,
  );

  const { parentNetNode } = data;

  return (
    <Box sx={{ position: "relative" }}>
      {parentNetNode && (
        <Tooltip title="Place from parent net">
          <IconDiagramRegular
            sx={{
              fill: ({ palette }) => palette.gray[60],
              position: "absolute",
              top: 10,
              left: nodeDimensions.place.width / 2 - 8,
              fontSize: 16,
              zIndex: 3,
            }}
          />
        </Tooltip>
      )}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <Box sx={placeStyling}>
        {data.label}

        {nonZeroTokens.map(([tokenTypeId, count], index) => {
          const tokenType = petriNetDefinition.tokenTypes.find(
            (tt) => tt.id === tokenTypeId,
          );

          const position = getTokenPosition(index);

          return (
            <Box
              key={tokenTypeId}
              sx={{
                position: "absolute",
                ...position,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: tokenSize,
                height: tokenSize,
                borderRadius: tokenSize / 2,
                backgroundColor: tokenType?.color ?? "#3498db",
                color: ({ palette }) => palette.common.white,
                fontSize: 12,
                fontWeight: "bold",
                padding: "0 4px",
                zIndex: 3,
              }}
            >
              {count}
            </Box>
          );
        })}
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={handleStyling}
      />
    </Box>
  );
};
