import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
import type { NodeProps } from "reactflow";

import { FlowStepStatus } from "../../../graphql/api-types.gen";
import { Handles } from "./custom-node/handles";
import { NodeContainer } from "./custom-node/node-container";
import type { NodeData } from "./shared/types";
import { Handle, Position, useNodeId } from "reactflow";
import { useStatusForStep } from "./shared/flow-runs-context";
import { statusSx, StepStatusName } from "./custom-node/styles";
import { formatDistance } from "date-fns";

const getTimeAgo = (isoString: string) =>
  formatDistance(new Date(isoString), new Date(), {
    addSuffix: true,
  });

export const CustomNode = ({
  data,
  selected,
  ...rest
}: NodeProps<NodeData>) => {
  // const isParallel = data.inputSources.find(
  //   (input) => input.kind === "parallel-group-input",
  // );

  const statusData = useStatusForStep();

  let stepStatusName: StepStatusName = "Waiting";
  if (statusData) {
    switch (statusData.status) {
      case FlowStepStatus.Completed:
        stepStatusName = "Complete";
        break;
      case FlowStepStatus.Failed:
      case FlowStepStatus.TimedOut:
      case FlowStepStatus.Canceled:
        stepStatusName = "Error";
        break;
      case FlowStepStatus.Scheduled:
      case FlowStepStatus.Started:
        stepStatusName = "In Progress";
        break;
    }
  }

  const isParallel = false;

  const styles = statusSx[stepStatusName];

  const { closedAt, scheduledAt } = statusData ?? {};

  const isoString =
    (stepStatusName === "Complete" || stepStatusName === "Error") && closedAt
      ? closedAt
      : stepStatusName === "In Progress" && scheduledAt
        ? scheduledAt
        : null;

  return (
    <NodeContainer selected={selected} stepStatusName={stepStatusName}>
      <Stack justifyContent="space-between" sx={{ height: "100%" }}>
        <Typography sx={{ textAlign: "left", fontSize: 14, fontWeight: 400 }}>
          {data.label}
          {/*{isParallel ? "[]" : ""}*/}
        </Typography>
        <Stack direction="row">
          <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
            {isoString ? getTimeAgo(isoString) : ""}
          </Typography>
          <Typography
            sx={{
              fontSize: 12,
              ml: 0.5,
              color: ({ palette }) => palette.gray[60],
            }}
          >
            {isoString ? `(${isoString})` : ""}
          </Typography>
        </Stack>

        <Box
          sx={{
            background: styles.lightestBackground,
            borderRadius: 2.5,
            p: 2,
          }}
        >
          <Typography
            sx={{
              color: styles.text,
              fontSize: 12,
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            {stepStatusName === "Complete"
              ? "Successfully completed"
              : stepStatusName === "In Progress"
                ? "Currently processing step..."
                : stepStatusName === "Error"
                  ? "Step failed to complete"
                  : "Waiting for earlier stages to finish"}
          </Typography>
        </Box>

        <Handles
          inputSources={data.inputSources}
          stepDefinition={data.stepDefinition}
          stepStatusName={stepStatusName}
        />
      </Stack>
    </NodeContainer>
  );
};
