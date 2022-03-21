import { Components } from "@mui/material";

// @todo use a function to calculate these sizes
export const MuiContainerThemeOptions: Components["MuiContainer"] = {
  styleOverrides: {
    root: {
      maxWidth: "1260px",
      paddingLeft: "16px",
      paddingRight: "16px",
      // @todo can i use breakpoints here?
      "@media (min-width: 600px)": {
        maxWidth: "1276px",
        paddingLeft: "24px",
        paddingRight: "24px",
      },
      // @todo check if this is correct?
      "@media (min-width: 1536px)": {
        maxWidth: "1292px",
        paddingLeft: "32px",
        paddingRight: "32px",
      },
    },
  },
};
