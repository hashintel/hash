import type { Components, Theme } from "@mui/material";

export const MuiListItemIconThemeOptions: Components<Theme>["MuiListItemIcon"] =
  {
    styleOverrides: {
      root: ({ theme }) => ({
        minWidth: 32,
        color: theme.palette.gray[70],
      }),
    },
  };
