/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiLinkThemeOptions: Components<Theme>["MuiLink"] = {
  styleOverrides: {
    root: ({ theme }) => ({
      textDecoration: "none",
      position: "relative",
      ":focus-visible": {
        border: "none",
        outline: `2px solid ${theme.palette.yellow[800]}`,
      },
    }),
  },
};
