import { Components, Theme } from "@mui/material";

export const MuiDrawerThemeOptions: Components<Theme>["MuiDrawer"] = {
  styleOverrides: {
    root: {
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
    },
    paper: {
      display: "flex",
      flexDirection: "column",
    },
  },
};
