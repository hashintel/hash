import { Stack, Typography } from "@mui/material";

import { Icon } from "@hashintel/ds-components";

import { DsComponentsScope } from "../shared/ds-components-scope";
import { NewFlowButton } from "./new-flow-button";

/** Shown on the flows page when there are no flows yet. */
export const FlowsEmptyState = () => (
  <Stack
    alignItems="center"
    gap={2}
    sx={{
      py: 12,
      border: ({ palette }) => `1px solid ${palette.gray[20]}`,
      borderRadius: 3,
    }}
  >
    <DsComponentsScope
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: ({ palette }) => palette.gray[10],
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
      }}
    >
      <Icon name="infinity" size="md" />
    </DsComponentsScope>
    <Stack alignItems="center" gap={0.5}>
      <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
        No flows yet
      </Typography>
      <Typography
        sx={{ fontSize: 14, color: ({ palette }) => palette.gray[60] }}
      >
        A flow runs the same steps each time: by hand, on a schedule, or when
        data changes.
      </Typography>
    </Stack>
    <NewFlowButton />
  </Stack>
);
