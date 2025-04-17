import { Box } from "@mui/material";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorContext } from "./editor-context";
import { placeStyling } from "./styling";
import type { TokenCounts } from "./types";

export const PlaceNode = ({ data, isConnectable }: NodeProps) => {
  const tokenCounts: TokenCounts = data.tokenCounts || {};

  const { tokenTypes } = useEditorContext();

  return (
    <div>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ background: "#555" }}
      />
      <Box sx={placeStyling}>
        {data.label}

        {/* Token counts in different positions */}
        {Object.entries(tokenCounts).map(([tokenTypeId, count], index) => {
          if (count === 0) {
            return null;
          }

          const positions = [
            { top: "0", left: "50%", transform: "translateX(-50%)" }, // Top
            { top: "50%", right: "0", transform: "translateY(-50%)" }, // Right
            { bottom: "0", left: "50%", transform: "translateX(-50%)" }, // Bottom
            { top: "50%", left: "0", transform: "translateY(-50%)" }, // Left
          ] as const;

          const position = positions[index % positions.length];
          const tokenType = tokenTypes.find((tt) => tt.id === tokenTypeId);

          return (
            <Box
              key={tokenTypeId}
              sx={{
                position: "absolute",
                ...position,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "24px",
                height: "24px",
                borderRadius: "12px",
                backgroundColor: tokenType?.color ?? "#3498db",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: "bold",
                padding: "0 4px",
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
        style={{ background: "#555" }}
      />
    </div>
  );
};
