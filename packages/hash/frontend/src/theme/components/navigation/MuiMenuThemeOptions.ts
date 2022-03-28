import { Components, Theme } from "@mui/material";

export const MuiMenuThemeOptions: Components<Theme>["MuiMenu"] = {
  defaultProps: {
    elevation: 4,
    autoFocus: false,
  },
  styleOverrides: {
    list: ({ theme }) => ({
      paddingTop: theme.spacing(0.5),
      paddingBottom: theme.spacing(0.5),
    }),
    paper: {
      minWidth: 228,
    },
  },
};
