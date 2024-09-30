import type { Theme } from "@mui/material";
import type { SystemStyleObject } from "@mui/system";

export const buttonSx: (theme: Theme) => SystemStyleObject<Theme> = ({
  palette,
}) => ({
  background: palette.common.white,
  borderColor: palette.gray[30],
  borderStyle: "solid",
  borderWidth: 1,
  borderRadius: "4px",
  position: "absolute",
  p: 0.6,
  transition: "none",
});
