import { Components, Theme } from "@mui/material";

export const MuiListItemIconThemeOptions: Components<Theme>["MuiListItemIcon"] =
  {
    styleOverrides: {
      root: ({ theme }) => ({
        color: theme.palette.gray[50],
        marginRight: 10,
        alignItems: "flex-start",
        "> svg": {
          fontSize: 16,
        },
      }),
    },
  };
