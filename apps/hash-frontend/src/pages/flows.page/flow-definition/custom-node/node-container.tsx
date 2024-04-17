import { Box, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { useNodeId, useStore } from "reactflow";

import { statusSx, StepStatusName } from "./styles";
import { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";
import { nodeTabHeight } from "../shared/dimensions";

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
      sx={({ transitions }) => ({
        background:
          position === "left" ? styles.lightBackground : styles.darkBackground,
        borderColor: styles.borderColor,
        transition: transitions.create(["background", "borderColor"]),
        borderWidth: 1,
        borderStyle: "solid",
        borderBottomWidth: 0,
        borderTopLeftRadius: "7px",
        borderTopRightRadius: "7px",
        height: nodeTabHeight,
        px: 1,
        pt: 0.5,
        pb: 2,
        position: "relative",
        top: 12,
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
  kind,
  selected: _selected,
  stepStatusName,
}: PropsWithChildren<{
  kind: StepDefinition["kind"];
  selected: boolean;
  stepStatusName: StepStatusName;
}>) => {
  const nodeId = useNodeId();

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
    <Stack
      sx={{
        ...size,
      }}
    >
      <Stack direction="row" justifyContent="space-between">
        <Tab
          status={stepStatusName}
          label={nodeId === "trigger" ? "Trigger" : `Action ${nodeId ?? "?"}`}
          position="left"
        />
        {kind !== "parallel-group" && (
          <Tab
            status={stepStatusName}
            label={stepStatusName}
            position="right"
          />
        )}
      </Stack>
      <Box
        sx={({ palette, transitions }) => ({
          background: palette.common.white,
          borderColor: styles.borderColor,
          borderWidth: 1,
          borderStyle: "solid",
          borderRadius: 3,
          transition: transitions.create("borderColor"),
          p: 2,
          flex: 1,
          position: "relative",
        })}
      >
        {children}
      </Box>
    </Stack>
  );
};
