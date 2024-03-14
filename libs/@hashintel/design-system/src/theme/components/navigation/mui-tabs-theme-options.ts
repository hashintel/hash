import type { Components, Theme } from "@mui/material";

export const MuiTabsThemeOptions: Components<Theme>["MuiTabs"] = {
  styleOverrides: {
    root: {
      minHeight: 0,
      overflow: "visible",
      alignItems: "flex-end",
      flex: 1,
    },
    scroller: {
      overflow: "visible !important",
    },
    indicator: ({ theme }) => ({
      height: 3,
      backgroundColor: theme.palette.blue[60],
      minHeight: 0,
      bottom: -1,
    }),
  },
};
