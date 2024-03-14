import type { Components, Theme } from "@mui/material";

export const MuiSvgIconThemeOptions: Components<Theme>["MuiSvgIcon"] = {
  styleOverrides: {
    root: {
      fontSize: "var(--step-0)",
    },
  },
};
