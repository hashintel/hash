import type { PropsWithChildren, ReactElement } from "react";
import {
  Avatar,
  CheckIcon,
  CloseIcon,
  PersonRunningRegularIcon,
} from "@hashintel/design-system";
import { Stack, type SxProps, type Theme, Typography } from "@mui/material";

import type { FlowRun , FlowRunStatus } from "../../graphql/api-types.gen";
import { Link } from "../../shared/ui/link";

import { defaultCellSx } from "./virtualized-table";

export const flowTableRowHeight = 58;

export const flowTableCellSx = {
  ...defaultCellSx,
  height: flowTableRowHeight,
  "*": {
    whiteSpace: "nowrap",
    overflowX: "hidden",
    textOverflow: "ellipsis",
  },
};

export const flowTableChipSx: SxProps<Theme> = {
  background: ({ palette }) => palette.common.white,
  border: ({ palette }) => `1px solid ${palette.gray[30]}`,
  borderRadius: 2,
  display: "inline-flex",
  fontSize: 12,
  fontWeight: 500,
  height: 26,
  lineHeight: 1,
  px: 1.2,
};

export const FlowTableWebChip = ({
  avatarUrl,
  name,
  shortname,
}: {
  avatarUrl?: string;
  name: string;
  shortname: string;
}) => (
  <Link noLinkStyle href={`/@${shortname}`}>
    <Stack
      direction={"row"}
      alignItems={"center"}
      justifyContent={"center"}
      gap={0.8}
      sx={({ palette, transitions }) => ({
        ...flowTableChipSx,
        "&:hover": {
          border: `1px solid ${palette.common.black}`,
        },
        transition: transitions.create("border"),
      })}
    >
      <Avatar src={avatarUrl} title={name} size={14} />
      <Typography component={"span"} sx={{ fontSize: 12, fontWeight: 500 }}>
        {name}
      </Typography>
    </Stack>
  </Link>
);

export type SimpleFlowRunStatus =
  | "Running"
  | "Completed"
  | "Abandoned"
  | "Errored";

export const flowRunStatusToStatusText = (
  status: FlowRun["status"],
): SimpleFlowRunStatus => {
  switch (status) {
    case FlowRunStatus.Running:
    case FlowRunStatus.ContinuedAsNew: {
      return "Running";
    }
    case FlowRunStatus.Completed: {
      return "Completed";
    }
    case FlowRunStatus.Cancelled:
    case FlowRunStatus.Terminated: {
      return "Abandoned";
    }
    case FlowRunStatus.Failed:
    case FlowRunStatus.TimedOut:
    case FlowRunStatus.Unknown:
    case FlowRunStatus.Unspecified: {
      return "Errored";
    }
  }
};

const statusIcon: Record<SimpleFlowRunStatus, ReactElement> = {
  Abandoned: (
    <CloseIcon
      sx={{
        fill: ({ palette }) => palette.error.main,
        fontSize: 8,
      }}
    />
  ),
  Errored: (
    <CloseIcon
      sx={{
        fill: ({ palette }) => palette.red[80],
        fontSize: 8,
      }}
    />
  ),
  Completed: (
    <CheckIcon
      aria-label={"Entities successfully inferred"}
      sx={{
        fill: ({ palette }) => palette.green[80],
        fontSize: 9,
      }}
    />
  ),
  Running: (
    <PersonRunningRegularIcon
      sx={{
        fill: ({ palette }) => palette.gray[50],
        fontSize: 12,
      }}
    />
  ),
};

export const FlowTableChip = ({
  children,
  sx,
}: PropsWithChildren<{ sx?: SxProps<Theme> }>) => (
  <Stack
    direction={"row"}
    alignItems={"center"}
    justifyContent={"center"}
    gap={1}
    sx={[flowTableChipSx, ...(Array.isArray(sx) ? sx : [sx])]}
  >
    {children}
  </Stack>
);

export const FlowStatusChip = ({
  status,
  sx,
}: {
  status: SimpleFlowRunStatus;
  sx?: SxProps<Theme>;
}) => {
  const icon = statusIcon[status];

  return (
    <FlowTableChip sx={sx}>
      {icon}
      <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{status}</Typography>
    </FlowTableChip>
  );
};
