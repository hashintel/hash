import { Box, Stack, Typography } from "@mui/material";
import { formatDistance } from "date-fns";
import { useEffect, useState } from "react";
import type { NodeProps } from "reactflow";

import {
  statusToSimpleStatus,
  useFlowRunsContext,
  useStatusForCurrentStep,
} from "../shared/flow-runs-context";
import type { NodeData } from "../shared/types";
import { Handles } from "./custom-node/handles";
import { NodeContainer } from "./custom-node/node-container";
import { statusSx } from "./custom-node/node-styles";

const getTimeAgo = (isoString: string) =>
  formatDistance(new Date(isoString), new Date(), {
    addSuffix: true,
  });

export const CustomNode = ({ data, id, selected }: NodeProps<NodeData>) => {
  const statusData = useStatusForCurrentStep();

  const { selectedFlowRun } = useFlowRunsContext();

  const { closedAt, scheduledAt } = statusData ?? {};

  const stepStatusName = statusToSimpleStatus(statusData?.status ?? null);

  const isoString =
    (stepStatusName === "Complete" || stepStatusName === "Error") && closedAt
      ? closedAt
      : stepStatusName === "In Progress" && scheduledAt
        ? scheduledAt
        : null;

  const [timeAgo, setTimeAgo] = useState(
    isoString ? getTimeAgo(isoString) : "",
  );

  const isParallelizedGroup = data.kind === "parallel-group";

  const isParallelizedStep = data.inputSources.find(
    (input) => input.kind === "parallel-group-input",
  );

  const styles = statusSx[stepStatusName];

  useEffect(() => {
    let timeUpdateInterval: NodeJS.Timeout | undefined;

    if (isoString) {
      setTimeAgo(getTimeAgo(isoString));

      timeUpdateInterval = setInterval(() => {
        setTimeAgo(getTimeAgo(isoString));
      }, 5_000);
    } else {
      setTimeAgo("");
    }

    return () => {
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
      }
    };
  }, [isoString]);

  return (
    <NodeContainer
      kind={data.kind}
      selected={selected}
      stepStatusName={stepStatusName}
    >
      <Stack justifyContent="space-between" sx={{ height: "100%" }}>
        <Typography sx={{ textAlign: "left", fontSize: 14, fontWeight: 400 }}>
          {data.label}
          {isParallelizedStep ? "[]" : ""}
        </Typography>
        <Stack direction="row" mb={2} mt={1}>
          <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
            {timeAgo}
          </Typography>
          <Typography
            sx={{
              fontSize: 12,
              ml: 0.5,
              color: ({ palette }) => palette.gray[60],
            }}
          >
            {timeAgo ? `(${isoString})` : ""}
          </Typography>
        </Stack>

        {!isParallelizedGroup && selectedFlowRun && (
          <Box
            sx={{
              background: styles.lightestBackground,
              borderRadius: 2.5,
              p: 2,
              transition: ({ transitions }) => transitions.create("background"),
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
        )}

        <Handles
          kind={data.kind}
          inputSources={data.inputSources}
          actionDefinition={data.actionDefinition}
          stepId={id}
          stepStatusName={stepStatusName}
        />
      </Stack>
    </NodeContainer>
  );
};
