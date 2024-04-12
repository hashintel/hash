import { Box, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { useNodeId, useStore } from "reactflow";

import { FlowStepStatus } from "../../../../graphql/api-types.gen";
import { useStatusForStep } from "../shared/flow-runs-context";
import { statusSx, StepStatusName } from "./styles";
import { NodeData } from "../shared/types";

const Tab = ({
  label,
  position,
  status,
}: {
  label: string;
  position: "left" | "right";
  status: StepStatusName;
}) => {
  const styles = statusSx[status];

  return (
    <Box
      sx={({ palette, transitions }) => ({
        background:
          position === "left" ? styles.lightBackground : styles.darkBackground,
        borderColor: styles.borderColor,
        borderWidth: 1,
        borderStyle: "solid",
        borderBottomWidth: 0,
        borderTopLeftRadius: "7px",
        borderTopRightRadius: "7px",
        px: 1,
        pt: 0.5,
        pb: 2,
        position: "absolute",
        top: -28,
        left: position === "left" ? -1 : "auto",
        right: position === "right" ? -1 : "auto",
        zIndex: -1,
      })}
    >
      <Typography
        sx={({ palette }) => ({
          color:
            position === "left"
              ? styles.text
              : status === "Waiting"
                ? palette.gray[80]
                : palette.common.white,
          fontSize: 12,
          fontWeight: 500,
        })}
      >
        {label}
      </Typography>
    </Box>
  );
};

export const NodeContainer = ({
  children,
  selected,
  stepStatusName,
}: PropsWithChildren<{
  selected: boolean;
  stepStatusName: StepStatusName;
}>) => {
  const nodeId = useNodeId();

  const statusData = useStatusForStep();

  const size = useStore((state) => {
    if (nodeId) {
      const node = state.nodeInternals.get(nodeId);
      if (node) {
        return {
          width: node.width,
          height: node.height,
        };
      }
    }
  });

  const styles = statusSx[stepStatusName];

  return (
    <Box
      sx={({ palette, transitions }) => ({
        background: palette.common.white,
        borderColor: styles.borderColor,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: 3,
        transition: transitions.create("border"),
        p: 2,
        position: "relative",
        ...size,
      })}
    >
      <Tab
        status={stepStatusName}
        label={nodeId === "trigger" ? "Trigger" : `Action ${nodeId ?? "?"}`}
        position="left"
      />
      <Tab status={stepStatusName} label={stepStatusName} position="right" />
      {children}
    </Box>
  );
};
