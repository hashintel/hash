import {
  Components,
  listItemAvatarClasses,
  listItemIconClasses,
  listItemSecondaryActionClasses,
  listItemTextClasses,
  menuItemClasses,
  Theme,
} from "@mui/material";

export const MuiMenuItemThemeOptions: Components<Theme>["MuiMenuItem"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      borderRadius: "4px",
      padding: theme.spacing(1, 1.5),
      ...theme.typography.smallTextLabels,

      [`& .${listItemIconClasses.root}`]: {
        color: theme.palette.gray[50],
        minWidth: "unset",
        marginRight: 12,
        alignItems: "flex-start",
      },

      [`& .${listItemAvatarClasses.root}`]: {
        border: "2px solid transparent",
        marginRight: "12px",
        borderRadius: "50%",
        minWidth: "unset",
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

      [`& .${listItemSecondaryActionClasses.root}`]: {
        ...theme.typography.smallTextLabels,
        fontWeight: 500,
        color: theme.palette.gray[50],

        "& svg": {
          fontSize: 12,
          color: "currentColor",
        },
      },

      // HOVER STYLES
      "&:hover": {
        backgroundColor: theme.palette.gray[20],
        color: theme.palette.gray[80],

        [`& .${listItemIconClasses.root}`]: {
          color: theme.palette.gray[60],
        },

        [`& .${listItemTextClasses.primary}`]: {
          color: theme.palette.gray[90],
        },

        [`& .${listItemTextClasses.secondary}`]: {
          color: theme.palette.gray[70],
        },

        [`& .${listItemAvatarClasses.root}`]: {
          borderColor: theme.palette.white,
        },

        [`& .${listItemSecondaryActionClasses.root}`]: {
          color: theme.palette.gray[70],
        },
      },

      // FOCUS STYLES
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

          [`& .${listItemSecondaryActionClasses.root}`]: {
            color: theme.palette.blue[30],
          },

          /**
           * @todo add styles for when ownerState.dense = true
           * This will handle scenarios where the menu item is smaller
           */
        },
    }),
  },
};
