import type { Components, Theme } from "@mui/material";
import { listItemIconClasses, listItemTextClasses } from "@mui/material";

export const MuiListItemButtonThemeOptions: Components<Theme>["MuiListItemButton"] =
  {
    defaultProps: {
      disableRipple: true,
      disableTouchRipple: true,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        paddingLeft: theme.spacing(5),
        "&:hover": {
          backgroundColor: theme.palette.gray[20],
          [`.${listItemTextClasses.primary}, .${listItemIconClasses.root}`]: {
            color: theme.palette.gray[90],
          },
        },
        "&.Mui-selected": {
          background: theme.palette.teal[20],
          "&:hover": {
            background: theme.palette.teal[20],
          },
          [`.${listItemTextClasses.primary}, .${listItemIconClasses.root}`]: {
            color: theme.palette.teal[90],
          },
        },
      }),
    },
  };
