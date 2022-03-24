import { Components, Theme } from "@mui/material";

export const MuiMenuThemeOptions: Components<Theme>["MuiMenu"] = {
  defaultProps: {
    elevation: 4,
    autoFocus: false,
  },
  styleOverrides: {
    list: {
      paddingTop: "4px",
      paddingBottom: "4px",
    },
    paper: {
      minWidth: 228,
    },
  },
};
