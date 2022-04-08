import { Components } from "@mui/material";

export const MuiContainerThemeOptions: Components["MuiContainer"] = {
  styleOverrides: {
    root: {
      maxWidth: "1260px",
      paddingLeft: "16px",
      paddingRight: "16px",
      "@media (min-width: 600px)": {
        maxWidth: "1276px",
        paddingLeft: "24px",
        paddingRight: "24px",
      },
      "@media (min-width: 1536px)": {
        maxWidth: "1292px",
        paddingLeft: "32px",
        paddingRight: "32px",
      },
    },
  },
};
