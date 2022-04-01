import {
  Components,
  Theme,
  menuItemClasses,
  dividerClasses,
  listItemTextClasses,
  listItemIconClasses,
  listItemAvatarClasses,
} from "@mui/material";

export const MuiMenuItemThemeOptions: Components<Theme>["MuiMenuItem"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      borderRadius: "4px",
      padding: theme.spacing(1, 1.5),
      ...theme.typography.smallTextLabels,

      "&:hover": {
        backgroundColor: theme.palette.gray[20],
        color: theme.palette.gray[80],
      },

      [`& .${listItemTextClasses.primary}`]: {
        ...theme.typography.smallTextLabels,
        fontWeight: 500,
        color: theme.palette.gray[80],
      },

      [`& .${listItemTextClasses.secondary}`]: {
        ...theme.typography.microText,
        marginTop: "2px",
        fontWeight: 500,
        color: theme.palette.gray[50],
      },

      [`& .${listItemIconClasses.root}`]: {
        color: theme.palette.gray[50],
        minWidth: "unset",
        marginRight: 12,
      },

      [`& .${listItemAvatarClasses.root}`]: {
        border: "2px solid transparent",
        marginRight: "12px",
        borderRadius: "50%",
        minWidth: "unset",
      },

      "&:focus": {
        outline: "none",
      },

      [`&.${menuItemClasses.focusVisible}, &:focus`]: {
        boxShadow: `0px 0px 0px 2px ${theme.palette.white}, 0px 0px 0px 4px ${theme.palette.blue[70]}`,
        backgroundColor: "transparent",
      },

      [`&.${menuItemClasses.selected}, &.${menuItemClasses.selected}:hover, &:active`]:
        {
          backgroundColor: theme.palette.blue[70],
          color: theme.palette.common.white,
          boxShadow: "unset",

          [`& .${listItemIconClasses.root}`]: {
            color: theme.palette.blue[30],
          },

          [`& .${listItemTextClasses.primary}`]: {
            color: theme.palette.white,
          },

          [`& .${listItemTextClasses.secondary}`]: {
            color: theme.palette.blue[30],
          },

          [`& .${listItemAvatarClasses.root}`]: {
            borderColor: theme.palette.white,
          },
        },

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
