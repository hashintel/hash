import type { Components, Theme } from "@mui/material";

export const MuiLinkThemeOptions: Components<Theme>["MuiLink"] = {
  styleOverrides: {
    root: ({ theme }) => ({
      textDecoration: "none",
      color: "inherit",
      ".MuiTypography-hashBodyCopy &": {
        textDecoration: "none",
        color: theme.palette.teal[80],
        borderBottomColor: theme.palette.teal[80],
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        position: "relative",
        ":focus-visible": {
          border: "none",
          outline: `2px solid ${theme.palette.teal[90]}`,
        },
        ":hover": {
          color: theme.palette.teal[90],
          borderBottomColor: theme.palette.teal[90],
          transition: "background-color 0.3s ease-in-out",
        },
      },
    }),
  },
};
