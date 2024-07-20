import { formatDistance } from "date-fns";
import { memo } from "react";
import {
  CircleOneRegularIcon,
  LightbulbOnRegularIcon,
} from "@hashintel/design-system";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import { Stack, Typography } from "@mui/material";

import { Link } from "../../../../shared/ui/link";
import type {
  FlowStatusChip,
  flowTableCellSx,
  FlowTableChip,
  SimpleFlowRunStatus,
} from "../../../shared/flow-tables";

export interface GoalSummary {
  flowRunId: EntityUuid;
  openInputRequests: number;
  lastEventTimestamp: string;
  name: string;
  status: SimpleFlowRunStatus;
  web: {
    avatarUrl?: string;
    name: string;
    shortname: string;
  };
}

export const goalRowSx = {
  ...flowTableCellSx,
  display: "flex",
  alignItems: "center",
  height: 46,
  px: 2.5,
};

export const GoalRow = memo(({ goalSummary }: { goalSummary: GoalSummary }) => {
  const {
    name,
    lastEventTimestamp,
    openInputRequests,
    web,
    flowRunId,
    status,
  } = goalSummary;

  const inputRequired = openInputRequests > 0;

  return (
    <Stack
      direction={"row"}
      alignItems={"center"}
      sx={{
        ...goalRowSx,
        background: ({ palette }) =>
          inputRequired ? palette.yellow[10] : palette.common.white,
      }}
    >
      <Typography mr={2} sx={{ fontSize: 14 }}>
        Research
      </Typography>
      {status !== "Running" && (
        <FlowStatusChip status={status} sx={{ mr: 2.2 }} />
      )}
      <FlowTableChip>
        <CircleOneRegularIcon
          sx={{ fill: ({ palette }) => palette.blue[70], fontSize: 12 }}
        />
        One-off
      </FlowTableChip>

      <Link
        href={generateWorkerRunPath({ shortname: web.shortname, flowRunId })}
        sx={{
          display: "block",
          fontSize: 14,
          fontWeight: 600,
          ml: 2.2,
          mr: 1,
          textDecoration: "none",
        }}
      >
        {name}
      </Link>
      <Typography
        mr={2.5}
        sx={{ fontSize: 14, color: ({ palette }) => palette.gray[80] }}
      >
        last event{" "}
        {formatDistance(new Date(lastEventTimestamp), new Date(), {
          addSuffix: true,
        })}
      </Typography>
      {inputRequired && (
        <FlowTableChip
          sx={{
            borderColor: ({ palette }) => palette.yellow[50],
            borderRadius: 4,
          }}
        >
          <LightbulbOnRegularIcon
            sx={{ fill: ({ palette }) => palette.yellow[90], fontSize: 14 }}
          />
          Input required
        </FlowTableChip>
      )}
    </Stack>
  );
});
