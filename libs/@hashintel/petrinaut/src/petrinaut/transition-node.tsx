import { IconButton, IconDiagramRegular } from "@hashintel/design-system";
import { Box, Tooltip, Typography } from "@mui/material";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorContext } from "./editor-context";
import { handleStyling, transitionStyling } from "./styling";
import type { TransitionNodeData } from "./types";

export const TransitionNode = ({
  data,
  isConnectable,
}: NodeProps<TransitionNodeData>) => {
  const { label, description, childNet } = data;

  const { loadPetriNet } = useEditorContext();

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
        {childNet && (
          <Tooltip title={`Switch to child net ${childNet.childNetTitle}`}>
            <IconButton
              onClick={(event) => {
                event.stopPropagation();

                loadPetriNet(childNet.childNetId);
              }}
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                "&:hover": {
                  background: "transparent",
                  "& svg": {
                    fill: ({ palette }) => palette.blue[70],
                  },
                },
              }}
            >
              <IconDiagramRegular sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        )}

        {label}

        {description && (
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: "text.secondary",
              mt: 0.5,
              textAlign: "center",
            }}
          >
            {description}
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
