/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiListItemIconThemeOptions: Components<Theme>["MuiListItemIcon"] =
  {
    styleOverrides: {
      root: ({ theme }) => ({
        minWidth: theme.spacing(4),
        color: theme.palette.gray[80],
      }),
    },
  };
