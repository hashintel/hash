import type { SxProps, Theme } from "@mui/system";

export const inputStyles: SxProps<Theme> = ({ palette }) => ({
  border: `1px solid ${palette.gray[30]}`,
  borderRadius: 1,
  fontSize: 14,
  py: 1.2,
  px: 1.5,
  mt: 0.5,
});
