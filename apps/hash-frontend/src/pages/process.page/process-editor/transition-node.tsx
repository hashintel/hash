import { IconButton, IconDiagramRegular } from "@hashintel/design-system";
import { Box, Typography } from "@mui/material";
import { Handle, type NodeProps, Position } from "reactflow";

import { useEditorContext } from "./editor-context";
import { handleStyling, transitionStyling } from "./styling";
import type { TransitionNodeData } from "./types";

export const TransitionNode = ({
  data,
  isConnectable,
}: NodeProps<TransitionNodeData>) => {
  const { label, description, subProcess } = data;

  const { switchToNet, persistedNets } = useEditorContext();

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
        {subProcess && (
          <IconButton
            onClick={(event) => {
              event.stopPropagation();

              const subProcessPersistedNet = persistedNets.find(
                (net) => net.entityId === subProcess.subProcessEntityId,
              );

              if (subProcessPersistedNet) {
                switchToNet(subProcessPersistedNet);
              } else {
                throw new Error("Sub process not available locally");
              }
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
