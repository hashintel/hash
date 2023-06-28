import { Components, Theme } from "@mui/material";

export const MuiListItemIconThemeOptions: Components<Theme>["MuiListItemIcon"] =
  {
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.palette.gray[70],
      }),
    },
  };
