import {
  CheckIcon,
  CloseIcon,
  DashIcon,
  IconButton,
} from "@hashintel/design-system";
import { CircularProgress, TableCell, Tooltip } from "@mui/material";
import type { MouseEvent } from "react";
import { useState } from "react";

import { FlowRunStatus } from "../../../../../../../graphql/api-types.gen";
import type { MinimalFlowRun } from "../../../../../../../shared/storage";
import { sendMessageToBackground } from "../../../../../../shared/messages";
import { CellWithHoverButton } from "./cell-with-hover-button";
import { Chip } from "./chip";

const flowStatusToStatusText = (status: FlowRunStatus) => {
  switch (status) {
    case FlowRunStatus.Running:
    case FlowRunStatus.ContinuedAsNew:
      return "Running";
    case FlowRunStatus.Completed:
      return "Done";
    case FlowRunStatus.Cancelled:
    case FlowRunStatus.Terminated:
      return "Cancelled";
    case FlowRunStatus.Failed:
    case FlowRunStatus.TimedOut:
    case FlowRunStatus.Unknown:
    case FlowRunStatus.Unspecified:
      return "Failed";
  }
};

const iconSx = {
  fontSize: 14,
  mr: 0.8,
};

const CancelButton = ({
  onClick,
}: {
  onClick: (event: MouseEvent) => void;
}) => (
  <Tooltip title="Cancel flow">
    <IconButton
      onClick={onClick}
      sx={{
        p: 0,
        "&:hover": { background: "none" },
        "& svg": { fontSize: 14, mr: 0 },
      }}
    >
      <CloseIcon
        sx={({ palette, transitions }) => ({
          ...iconSx,
          fill: palette.gray[30],
          transition: transitions.create("fill"),
          "&:hover": {
            fill: `${palette.red[70]} !important`,
          },
        })}
      />
    </IconButton>
  </Tooltip>
);

export const FlowStatusCell = ({ flowRun }: { flowRun: MinimalFlowRun }) => {
  const [cancellationRequested, setCancellationRequested] = useState(false);

  const statusText = flowStatusToStatusText(flowRun.status);

  const isUnproductiveSuccessfulRequest =
    (flowRun.status === FlowRunStatus.Completed ||
      flowRun.status === FlowRunStatus.Cancelled) &&
    (flowRun.persistedEntities.length === 0 ||
      flowRun.persistedEntities.every(
        (persistedEntity) =>
          persistedEntity.operation === "already-exists-as-proposed",
      ));

  const cancelRequest = (event: MouseEvent) => {
    event.stopPropagation();
    void sendMessageToBackground({
      flowRunId: flowRun.flowRunId,
      type: "cancel-infer-entities",
    });
    setCancellationRequested(true);
  };

  if (statusText === "Running") {
    return (
      <CellWithHoverButton
        button={
          cancellationRequested ? (
            <Tooltip title="Cancellation pending">
              <CircularProgress
                variant="indeterminate"
                size={13}
                sx={{ color: ({ palette }) => palette.red[70] }}
              />
            </Tooltip>
          ) : (
            <CancelButton onClick={cancelRequest} />
          )
        }
      >
        <Chip>
          <CircularProgress variant="indeterminate" size={12} sx={{ mr: 1 }} />
          {statusText}
        </Chip>
      </CellWithHoverButton>
    );
  }

  return (
    <TableCell>
      {statusText === "Done" ? (
        isUnproductiveSuccessfulRequest ? (
          <Tooltip title="No entities created or updated" placement="top">
            <Chip>
              <DashIcon
                sx={{ fill: ({ palette }) => palette.gray[40], ...iconSx }}
              />
              No changes
            </Chip>
          </Tooltip>
        ) : (
          <Tooltip title="Entities successfully inferred" placement="top">
            <Chip>
              <CheckIcon
                aria-label="Entities successfully inferred"
                sx={{
                  fill: ({ palette }) => palette.blue[70],
                  ...iconSx,
                }}
              />
              {statusText}
            </Chip>
          </Tooltip>
        )
      ) : (
        <Chip>
          <CloseIcon
            sx={{
              fill: ({ palette }) => palette.pink[80],
              ...iconSx,
            }}
          />
          {statusText}
        </Chip>
      )}
    </TableCell>
  );
};
