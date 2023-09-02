import { Components, Theme } from "@mui/material";

export const MuiTabsItemThemeOptions: Components<Theme>["MuiTabs"] = {
  defaultProps: {},
  styleOverrides: {
    flexContainer: ({ theme }) => ({
      columnGap: theme.spacing(3.75),
    }),
    indicator: ({ theme }) => ({
      height: 3,
      backgroundColor: theme.palette.teal[60],
    }),
  },
};
