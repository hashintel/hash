import { Chip, ChipProps } from "@hashintel/design-system";
import { styled } from "@mui/material";

export const WhiteChip = styled(({ ...props }: ChipProps) => (
  <Chip variant="outlined" {...props} />
))(({ theme }) => ({
  background: "white",
  borderColor: theme.palette.gray[30],
}));
