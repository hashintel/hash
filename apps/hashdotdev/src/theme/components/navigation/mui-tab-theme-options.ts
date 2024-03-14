import type { Components, Theme } from "@mui/material";

export const MuiTabItemThemeOptions: Components<Theme>["MuiTab"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      paddingLeft: 0,
      paddingRight: 0,
      minWidth: "unset",
      textTransform: "none",
      color: theme.palette.black,
      fontSize: 14,
      "&.Mui-selected": {
        color: theme.palette.teal[60],
      },
    }),
  },
};
