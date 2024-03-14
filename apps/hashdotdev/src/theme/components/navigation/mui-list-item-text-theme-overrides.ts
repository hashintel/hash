import type { Components, Theme } from "@mui/material";

export const MuiListItemTextThemeOptions: Components<Theme>["MuiListItemText"] =
  {
    styleOverrides: {
      primary: ({ theme }) => ({
        color: theme.palette.gray[70],
        fontWeight: 500,
      }),
    },
  };
