import { Box, Typography } from "@mui/material";
import { Handle, type NodeProps, Position } from "reactflow";

import { handleStyling, transitionStyling } from "./styling";
import type { TransitionNodeData } from "./types";

export const TransitionNode = ({
  data,
  isConnectable,
}: NodeProps<TransitionNodeData>) => {
  return (
    <div
      style={{
        position: "relative",
        background: "transparent",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={handleStyling}
      />
      <Box sx={transitionStyling}>
        {data.label}

        {data.description && (
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: "text.secondary",
              mt: 0.5,
              textAlign: "center",
            }}
          >
            {data.description}
          </Typography>
        )}
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={handleStyling}
      />
    </div>
  );
};
