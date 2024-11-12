import type { Theme } from "@mui/material";
import type { SystemStyleObject } from "@mui/system";

export const tableContentSx: (theme: Theme) => SystemStyleObject<Theme> = ({
  palette,
}) => ({
  border: `1px solid ${palette.gray[30]}`,
  borderTop: "none",
  borderBottomLeftRadius: 8,
  borderBottomRightRadius: 8,
  background: palette.common.white,
});
