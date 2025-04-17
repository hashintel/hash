import { Box, CircularProgress, Typography } from "@mui/material";
import { Handle, type NodeProps, Position } from "reactflow";

import { nodeDimensions } from "./node-dimensions";
import type { TransitionNodeData } from "./types";

export const TransitionNode = ({
  data,
  isConnectable,
}: NodeProps<TransitionNodeData>) => {
  const isTimed = !!data.delay;

  // Check if transition is in progress
  const inProgress = data.inProgress === true;
  const progress = data.progress || 0;

  return (
    <div
      style={{
        position: "relative",
        background: "transparent",
        opacity: inProgress ? 1 : 0.5,
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
          borderRadius: 0,
          width: nodeDimensions.transition.width,
          height: nodeDimensions.transition.height,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: palette.gray[20],
          border: `2px solid ${inProgress ? palette.primary.main : palette.gray[50]}`,
          fontSize: "1rem",
          boxSizing: "border-box",
          position: "relative",
        })}
      >
        {data.label}

        {/* Display processing time if this is a timed transition and not in progress */}
        {isTimed && !inProgress && (
          <Box
            sx={{
              position: "absolute",
              top: -8,
              right: -8,
              backgroundColor: "primary.main",
              color: "white",
              borderRadius: "50%",
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: "bold",
            }}
            title={`Average processing time: ${avgProcessingTime} hours`}
          >
            ⏱️
          </Box>
        )}

        {/* Show progress indicator when transition is in progress - moved to top right */}
        {inProgress && (
          <Box
            sx={{
              position: "absolute",
              top: -12,
              right: -12,
              width: 32,
              height: 32,
              backgroundColor: "white",
              borderRadius: "50%",
              boxShadow: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress
              variant="determinate"
              value={progress * 100}
              size={30}
              thickness={4}
              sx={{ color: "primary.main" }}
            />
            <Box
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography
                component="div"
                color="text.secondary"
                sx={{ fontWeight: "bold", fontSize: "0.7rem" }}
              >
                {Math.round(progress * 100)}%
              </Typography>
            </Box>
          </Box>
        )}

        {/* Show description if available */}
        {data.description && !inProgress && (
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

        {/* Show remaining time if in progress */}
        {inProgress && data.duration && (
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: "text.secondary",
              mt: 0.5,
              textAlign: "center",
            }}
          >
            {Math.ceil(data.duration * (1 - progress))} hours remaining
          </Typography>
        )}
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
