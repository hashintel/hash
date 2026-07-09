import { styled } from "@mui/material";

import { Chip } from "@hashintel/design-system";

import type { ChipProps } from "@hashintel/design-system";

export const WhiteChip = styled(({ ...props }: ChipProps) => (
  <Chip variant="outlined" {...props} />
))(({ theme }) => ({
  background: "white",
  borderColor: theme.palette.gray[30],
}));
