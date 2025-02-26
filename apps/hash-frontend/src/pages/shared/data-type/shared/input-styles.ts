import type { SystemStyleObject, Theme } from "@mui/system";

export const inputStyles: (theme: Theme) => SystemStyleObject<Theme> = ({
  palette,
}) => ({
  border: `1px solid ${palette.gray[30]}`,
  borderRadius: 1,
  color: palette.gray[80],
  fontSize: 14,
  py: 1.2,
  px: 1.5,
  mt: 0.5,
});
