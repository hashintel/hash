import { Box } from "@mui/material";
import { Handle, type NodeProps, Position } from "reactflow";

import { nodeDimensions } from "./node-dimensions";
import type { TokenCounts } from "./place-editor";
import type { TokenType } from "./token-type-editor";

export const PlaceNode = ({ data, isConnectable }: NodeProps) => {
  const tokenCounts: TokenCounts = data.tokenCounts || {};
  const tokenTypes: TokenType[] = data.tokenTypes || [];

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
        style={{ background: "#555" }}
      />
      <Box
        sx={({ palette }) => ({
          padding: 1,
          borderRadius: "50%", // Circle for places
          width: nodeDimensions.place.width,
          height: nodeDimensions.place.height,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: palette.gray[20],
          border: `2px solid ${palette.gray[50]}`,
          fontSize: "1rem",
          boxSizing: "border-box",
          position: "relative",
          textAlign: "center",
        })}
      >
        {data.label}

        {/* Token counts in different positions */}
        {Object.entries(tokenCounts).map(([tokenTypeId, count], index) => {
          if (count === 0) {
            return null;
          }

          // Calculate position based on index
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
