import {
  Components,
  Theme,
  menuItemClasses,
  dividerClasses,
  listItemTextClasses,
} from "@mui/material";

export const MuiMenuItemThemeOptions: Components<Theme>["MuiMenuItem"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      //   marginLeft: theme.spacing(0.5),
      //   marginRight: theme.spacing(0.5),
      borderRadius: "4px",
      padding: theme.spacing(1, 1.5),
      ...theme.typography.smallTextLabels,

      "&:hover": {
        backgroundColor: theme.palette.gray[20],
        color: theme.palette.gray[80],
      },

      [`&.${menuItemClasses.focusVisible}`]: {
        backgroundColor: theme.palette.gray[20],
        color: theme.palette.gray[80],
      },

      [`&.${menuItemClasses.selected}`]: {
        backgroundColor: theme.palette.blue[70],
        color: theme.palette.common.white,
      },

      [`&.${menuItemClasses.selected}`]: {
        backgroundColor: theme.palette.blue[70],
        color: theme.palette.common.white,
      },

      [`& .${listItemTextClasses.root}`]: {},

      ...(!ownerState.disableGutters && {
        marginLeft: theme.spacing(0.5),
        marginRight: theme.spacing(0.5),
      }),

      [`& + .${dividerClasses.root}`]: {
        marginTop: theme.spacing(0.75),
        marginBottom: theme.spacing(0.75),
      },
    }),
  },
};
