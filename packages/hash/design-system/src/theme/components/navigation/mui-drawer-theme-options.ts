import { Components, Theme } from "@mui/material";

export const MuiDrawerThemeOptions: Components<Theme>["MuiDrawer"] = {
  styleOverrides: {
    root: {
      zIndex: 100,
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
