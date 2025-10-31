import { IconDiagramRegular } from "@hashintel/design-system";
import { Box, Tooltip } from "@mui/material";
import { Handle, type NodeProps, Position } from "reactflow";

import { handleStyling, nodeDimensions, placeStyling } from "./styling";
import type { PlaceNodeData } from "./types";

export const PlaceNode = ({
  data,
  id,
  isConnectable,
}: NodeProps<PlaceNodeData>) => {
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
      <Box sx={placeStyling}>{data.label}</Box>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={handleStyling}
      />
    </Box>
  );
};
