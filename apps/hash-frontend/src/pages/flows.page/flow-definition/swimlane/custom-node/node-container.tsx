import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";
import { Box, Stack, Typography } from "@mui/material";
import type { PropsWithChildren } from "react";
import { useNodeId, useStore } from "reactflow";

import { nodeTabHeight } from "../../shared/dimensions";
import type { SimpleStatus } from "../../shared/flow-runs-context";
import { useFlowRunsContext } from "../../shared/flow-runs-context";
import { transitionOptions } from "../../shared/styles";
import { statusSx } from "./node-styles";

const Tab = ({
  label,
  position,
  status,
}: {
  label: string;
  position: "left" | "right";
  status: SimpleStatus;
}) => {
  const styles = statusSx[status];

  return (
    <Box
      sx={({ transitions }) => ({
        background:
          position === "left" ? styles.lightBackground : styles.darkBackground,
        borderColor: styles.borderColor,
        borderWidth: 1,
        borderStyle: "solid",
        borderBottomWidth: 0,
        borderTopLeftRadius: "7px",
        borderTopRightRadius: "7px",
        height: nodeTabHeight.gross,
        px: 1,
        pt: 0.5,
        pb: 2,
        position: "relative",
        top: nodeTabHeight.offset,
        transition: transitions.create(
          ["background", "borderColor"],
          transitionOptions,
        ),
        zIndex: -1,
      })}
    >
      <Typography
        sx={({ palette, transitions }) => ({
          color:
            position === "left"
              ? styles.text
              : status === "Waiting"
                ? palette.gray[80]
                : palette.common.white,
          fontSize: 12,
          fontWeight: 500,
          transition: transitions.create("color", transitionOptions),
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
  stepStatusName: SimpleStatus;
}>) => {
  const nodeId = useNodeId();

  const { selectedFlowRun } = useFlowRunsContext();

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
        {selectedFlowRun && kind !== "parallel-group" && (
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
