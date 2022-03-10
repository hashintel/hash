/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiTabThemeOptions: Components<Theme>["MuiTab"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
    tabIndex: 0,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      border: "1px solid transparent",
      textTransform: "none",
      padding: theme.spacing(1, 0),
      marginRight: theme.spacing(3),
      "&:focus-visible": {
        borderColor: theme.palette.purple[600],
      },
    }),
    textColorPrimary: ({ theme }) => ({
      color: theme.palette.gray[80],
    }),
  },
};
