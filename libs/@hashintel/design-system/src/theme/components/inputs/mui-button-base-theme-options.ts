import { Components, Theme } from "@mui/material";

export const MuiButtonBaseThemeOptions: Components<Theme>["MuiButtonBase"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
  },
};
