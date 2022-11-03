import { Chip, ChipProps } from "@hashintel/hash-design-system/chip";
import { styled } from "@mui/material";

export const WhiteChip = styled(({ ...props }: ChipProps) => (
  <Chip variant="outlined" {...props} />
))(({ theme }) => ({
  background: "white",
  borderColor: theme.palette.gray[30],
}));
