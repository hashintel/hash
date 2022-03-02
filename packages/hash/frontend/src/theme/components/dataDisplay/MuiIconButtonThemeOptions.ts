import { Components, Theme } from "@mui/material";

export const MuiIconButtonThemeOptions: Components<Theme>["MuiIconButton"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme }) => ({}),
  },
};
