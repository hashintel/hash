import { MinimalFlowRun } from "../../../../../../../shared/storage";
import { MouseEvent, useState } from "react";
import { FlowRunStatus } from "../../../../../../../graphql/api-types.gen";
import { sendMessageToBackground } from "../../../../../../shared/messages";
import {
  Box,
  CircularProgress,
  Stack,
  TableCell,
  Tooltip,
} from "@mui/material";
import {
  CheckIcon,
  CloseIcon,
  DashIcon,
  IconButton,
} from "@hashintel/design-system";

export const FlowStatusCellContents = ({ flow }: { flow: MinimalFlowRun }) => {
  const [cancellationRequested, setCancellationRequested] = useState(false);

  const isUnproductiveSuccessfulRequest =
    (flow.status === FlowRunStatus.Completed ||
      flow.status === FlowRunStatus.Cancelled) &&
    (flow.persistedEntities.length === 0 ||
      flow.persistedEntities.every(
        (persistedEntity) =>
          persistedEntity.operation === "already-exists-as-proposed",
      ));

  const cancelRequest = (event: MouseEvent) => {
    event.stopPropagation();
    void sendMessageToBackground({
      flowRunId: flow.flowRunId,
      type: "cancel-infer-entities",
    });
    setCancellationRequested(true);
  };

  return (
    <TableCell>
      {flow.status === FlowRunStatus.Running ? (
        <Stack alignItems="center" direction="row">
          {cancellationRequested ? (
            <Tooltip title="Cancellation pending..." placement="top">
              <CircularProgress
                variant="indeterminate"
                size={13}
                sx={{ mr: 1, color: ({ palette }) => palette.red[70] }}
              />
            </Tooltip>
          ) : (
            <Tooltip title="Cancel flow" placement="top">
              <IconButton
                onClick={cancelRequest}
                sx={{ p: 0, "&:hover": { background: "none" }, mr: 0.2 }}
              >
                <CloseIcon
                  sx={({ palette, transitions }) => ({
                    fill: palette.gray[30],
                    fontSize: 12,
                    mr: 1,
                    transition: transitions.create("fill"),
                    "&:hover": {
                      fill: palette.red[70],
                    },
                  })}
                />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Job in progress..." placement="top">
            <CircularProgress
              variant="indeterminate"
              size={13}
              sx={{ mr: 1 }}
            />
          </Tooltip>
        </Stack>
      ) : flow.status === FlowRunStatus.Completed ||
        flow.status === FlowRunStatus.Cancelled ? (
        <Stack alignItems="center" direction="row">
          {isUnproductiveSuccessfulRequest ? (
            <Tooltip title="No entities created or updated" placement="top">
              <Box sx={{ height: 16 }}>
                <DashIcon
                  sx={{ height: 16, fill: ({ palette }) => palette.gray[40] }}
                />
              </Box>
            </Tooltip>
          ) : (
            <Tooltip title="Entities successfully inferred" placement="top">
              <Box sx={{ height: 16 }}>
                <CheckIcon
                  aria-label="Entities successfully inferred"
                  sx={{
                    height: 16,
                    fill: ({ palette }) => palette.green[80],
                  }}
                />
              </Box>
            </Tooltip>
          )}
        </Stack>
      ) : (
        <CloseIcon
          sx={{
            fill: ({ palette }) => palette.pink[80],
            fontSize: 12,
            mr: 1,
          }}
        />
      )}
    </TableCell>
  );
};
