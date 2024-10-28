import type { SxProps, Theme } from "@mui/material";
import { outlinedInputClasses } from "@mui/material";

export const selectSx: SxProps<Theme> = {
  [`.${outlinedInputClasses.root} .${outlinedInputClasses.input}`]: {
    fontSize: 14,
    px: 1.5,
    py: 1,
  },
  [`.${outlinedInputClasses.root}`]: {
    boxShadow: "none",
  },
  width: "100%",
  mt: 0.3,
};
