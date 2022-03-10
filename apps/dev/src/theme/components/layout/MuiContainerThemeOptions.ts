/**
 * @todo update from blockprotocol
 */
import { Components } from "@mui/material";

export const MuiContainerThemeOptions: Components["MuiContainer"] = {
  styleOverrides: {
    root: {
      "@media (min-width: 1200px)": {
        maxWidth: "1400px",
      },
      paddingLeft: "16px",
      paddingRight: "16px",
      "@media (min-width): 900px": {
        paddingLeft: "32px",
        paddingRight: "32px",
      },
    },
  },
};
