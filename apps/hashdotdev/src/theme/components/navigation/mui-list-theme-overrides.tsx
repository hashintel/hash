import type { Components, Theme } from "@mui/material";

export const MuiListThemeOptions: Components<Theme>["MuiList"] = {
  styleOverrides: {
    root: () => ({
      paddingTop: 0,
      paddingBottom: 0,
    }),
  },
};
