import { Components, Theme } from "@mui/material";

export const MuiLinkThemeOptions: Components<Theme>["MuiLink"] = {
  styleOverrides: {
    root: ({ theme }) => ({
      textDecoration: "none",
      color: "inherit",
      ".MuiTypography-hashBodyCopy &": {
        textDecoration: "none",
        fontWeight: 700,
        position: "relative",
        ":focus-visible": {
          border: "none",
          outline: `2px solid ${theme.palette.purple[80]}`,
        },
        ":hover": {
          backgroundColor: theme.palette.purple[30],
          color: theme.palette.yellow[1000],
          transition: "background-color 0.3s ease-in-out",
        },
      },
    }),
  },
};
