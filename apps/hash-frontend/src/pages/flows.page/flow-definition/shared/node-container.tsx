import { Box } from "@mui/material";
import type { PropsWithChildren } from "react";
import { useNodeId, useStore } from "reactflow";
import { useStatusForStep } from "./flow-runs-context";
import { FlowStepStatus } from "../../../../graphql/api-types.gen";

export const NodeContainer = ({
  children,
  selected,
}: PropsWithChildren<{ selected: boolean }>) => {
  const nodeId = useNodeId();

  const status = useStatusForStep();

  const complete = status?.status === FlowStepStatus.Completed;
  const errored =
    status?.status === FlowStepStatus.Failed ||
    status?.status === FlowStepStatus.TimedOut;

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

  return (
    <Box
      sx={({ palette, transitions }) => ({
        background: palette.common.white,
        border: `1px solid ${palette.gray[30]}`,
        outline: complete
          ? `2px solid ${palette.green[70]}`
          : errored
          ? `2px solid ${palette.error.main}`
          : "none",
        borderRadius: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: transitions.create("border"),
        p: 4,
        ...size,
      })}
    >
      {children}
    </Box>
  );
};
