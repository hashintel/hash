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
      ":hover": {
        backgroundColor: theme.palette.yellow[300],
        color: theme.palette.yellow[1000],
        transition: "background-color 0.3s ease-in-out",
      },
    }),
  },
};
