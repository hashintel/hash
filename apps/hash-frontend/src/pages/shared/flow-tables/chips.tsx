import { Stack, Typography } from "@mui/material";

import {
  Avatar,
  CheckIcon,
  CloseIcon,
  PersonRunningRegularIcon,
} from "@hashintel/design-system";

import { Link } from "../../../shared/ui/link";
import { flowTableChipSx } from "./table-styles";

import type { SimpleFlowRunStatus } from "./flow-run-status";
import type { SxProps, Theme } from "@mui/material";
import type { PropsWithChildren, ReactElement } from "react";

export const FlowTableWebChip = ({
  avatarUrl,
  name,
  shortname,
  isOrg,
}: {
  avatarUrl?: string;
  name: string;
  shortname: string;
  isOrg: boolean;
}) => (
  <Link href={`/@${shortname}`} noLinkStyle>
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="center"
      gap={0.8}
      sx={({ palette, transitions }) => ({
        ...flowTableChipSx,
        "&:hover": {
          border: `1px solid ${palette.common.black}`,
        },
        transition: transitions.create("border"),
      })}
    >
      <Avatar
        src={avatarUrl}
        title={name}
        size={14}
        borderRadius={isOrg ? "4px" : undefined}
      />
      <Typography
        component="span"
        sx={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {name}
      </Typography>
    </Stack>
  </Link>
);

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
      aria-label="Entities successfully inferred"
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
    direction="row"
    alignItems="center"
    justifyContent="center"
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
