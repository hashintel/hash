import type { Theme } from "@mui/material";
import type { SystemStyleObject } from "@mui/system";

export const filterButtonSx: (theme: Theme) => SystemStyleObject<Theme> = ({
  palette,
  transitions,
}) => ({
  background: "transparent",
  border: "none",
  borderRadius: 1,
  cursor: "pointer",
  px: 1,
  py: 0.5,
  "& > span": {
    color: palette.blue[70],
    fontSize: 12,
  },
  "&:hover": {
    background: palette.blue[20],
  },
  transition: transitions.create("background"),
  visibility: "hidden",
});
