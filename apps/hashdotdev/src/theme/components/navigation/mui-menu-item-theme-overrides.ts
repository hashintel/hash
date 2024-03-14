import type { Components, Theme } from "@mui/material";
import { listItemIconClasses, listItemTextClasses } from "@mui/material";

export const MuiMenuItemThemeOptions: Components<Theme>["MuiMenuItem"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      "&:not(:last-child)": {
        marginBottom: 0,
      },
      minHeight: "unset",
      padding: theme.spacing(2),
      transition: theme.transitions.create("background"),
      "&:hover:not(.active)": {
        background: theme.palette.gray[10],
        [`.${listItemTextClasses.primary}, .${listItemIconClasses.root}`]: {
          color: theme.palette.gray[90],
        },
      },
      "&.active": {
        background: theme.palette.teal[20],
        [`.${listItemTextClasses.primary}, .${listItemIconClasses.root}`]: {
          color: theme.palette.teal[90],
        },
      },
    }),
  },
};
