import { Components, Theme } from "@mui/material";

export const SIDEBAR_WIDTH = 260;
export const HEADER_HEIGHT = 64;

export const MuiDrawerThemeOptions: Components<Theme>["MuiDrawer"] = {
  defaultProps: {
    anchor: "left",
    variant: "persistent",
  },
  styleOverrides: {
    root: {
      width: SIDEBAR_WIDTH,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      height: `calc(100vh - ${HEADER_HEIGHT}px)`,
    },
    paper: ({ theme }) => ({
      position: "relative",
      flex: 1,
      width: SIDEBAR_WIDTH,
      backgroundColor: theme.palette.gray[10],
      boxShadow:
        "inset -24px 0px 24px rgba(220, 229, 235, 0.15), inset -1px 0px 16px rgba(220, 229, 235, 0.4)",
      display: "flex",
      flexDirection: "column",
    }),
  },
};
