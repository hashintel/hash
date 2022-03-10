/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiListItemTextThemeOptions: Components<Theme>["MuiListItemText"] =
  {
    styleOverrides: {
      primary: ({ theme }) => ({
        fontWeight: 500,
        color: theme.palette.gray[80],
      }),
    },
  };
