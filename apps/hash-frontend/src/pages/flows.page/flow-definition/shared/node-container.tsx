import { Box, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { useNodeId, useStore } from "reactflow";

import { FlowStepStatus } from "../../../../graphql/api-types.gen";
import { useStatusForStep } from "./flow-runs-context";
import { statusSx } from "./styles";

const Tab = ({
  label,
  position,
  status,
}: {
  label: string;
  position: "left" | "right";
  status: keyof typeof statusSx;
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
          color: position === "left" ? styles.text : palette.common.white,
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
}: PropsWithChildren<{ selected: boolean }>) => {
  const nodeId = useNodeId();

  const statusData = useStatusForStep();

  let stepStatus: keyof typeof statusSx = "Complete";
  if (statusData) {
    switch (statusData.status) {
      case FlowStepStatus.Completed:
        stepStatus = "Complete";
        break;
      case FlowStepStatus.Failed:
      case FlowStepStatus.TimedOut:
      case FlowStepStatus.Canceled:
        stepStatus = "Error";
        break;
      case FlowStepStatus.Scheduled:
      case FlowStepStatus.Started:
        stepStatus = "In Progress";
        break;
    }
  }

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

  const styles = statusSx[stepStatus];

  return (
    <Box
      sx={({ palette, transitions }) => ({
        background: palette.common.white,
        borderColor: styles.borderColor,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: transitions.create("border"),
        p: 1.5,
        position: "relative",
        ...size,
      })}
    >
      <Tab status={stepStatus} label="Action 1" position="left" />
      <Tab status={stepStatus} label={stepStatus} position="right" />
      {children}
    </Box>
  );
};
