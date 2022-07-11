import { Components, Theme } from "@mui/material";

export const MuiDrawerThemeOptions: Components<Theme>["MuiDrawer"] = {
  defaultProps: {
    anchor: "left",
    variant: "persistent",
  },
  styleOverrides: {
    root: {
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
    },
    paper: ({ theme }) => ({
      position: "relative",
      flex: 1,
      backgroundColor: theme.palette.gray[10],
      boxShadow:
        "inset -24px 0px 24px rgba(220, 229, 235, 0.15), inset -1px 0px 16px rgba(220, 229, 235, 0.4)",
      display: "flex",
      flexDirection: "column",
      borderRight: `1px solid ${theme.palette.gray[30]}`,
    }),
  },
};
