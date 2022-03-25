import { Components, Theme } from "@mui/material";

export const MuiRadioThemeOptions: Components<Theme>["MuiRadio"] = {
  defaultProps: {
    disableRipple: true,
    disableFocusRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      color: theme.palette.gray[40],
    }),
  },
};
