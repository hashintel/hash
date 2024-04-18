import { Box, Stack, Typography } from "@mui/material";
import { formatDistance } from "date-fns";
import type { NodeProps } from "reactflow";

import {
  statusToSimpleStatus,
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

export const CustomNode = ({ data, selected }: NodeProps<NodeData>) => {
  const statusData = useStatusForCurrentStep();

  const stepStatusName = statusToSimpleStatus(statusData?.status ?? null);

  const isParallelizedGroup = data.kind === "parallel-group";

  const isParallelizedStep = data.inputSources.find(
    (input) => input.kind === "parallel-group-input",
  );

  const styles = statusSx[stepStatusName];

  const { closedAt, scheduledAt } = statusData ?? {};

  const isoString =
    (stepStatusName === "Complete" || stepStatusName === "Error") && closedAt
      ? closedAt
      : stepStatusName === "In Progress" && scheduledAt
        ? scheduledAt
        : null;

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

        {!isParallelizedGroup && (
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
          stepStatusName={stepStatusName}
        />
      </Stack>
    </NodeContainer>
  );
};
