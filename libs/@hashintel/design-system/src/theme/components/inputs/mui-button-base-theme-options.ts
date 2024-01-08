import { Components, Theme } from "@mui/material";

export const MuiButtonBaseThemeOptions: Components<Theme>["MuiButton"] = {
  defaultProps: {
    disableElevation: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
};
