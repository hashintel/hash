import type { SxProps, Theme } from "@mui/system";

export const typeHeaderContainerStyles: SxProps<Theme> = ({ palette }) => ({
  borderBottom: 1,
  borderColor: palette.gray[20],
  pt: 3.75,
  backgroundColor: palette.common.white,
});
