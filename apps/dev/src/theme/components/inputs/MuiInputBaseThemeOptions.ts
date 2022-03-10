/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiInputBaseThemeOptions: Components<Theme>["MuiInputBase"] = {
  styleOverrides: {
    adornedEnd: ({ theme }) => ({
      "&.Mui-error": {
        svg: {
          color: theme.palette.red[600],
        },
      },
    }),
  },
};
