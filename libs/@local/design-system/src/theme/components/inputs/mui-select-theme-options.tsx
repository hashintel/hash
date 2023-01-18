import { faAngleDown } from "@fortawesome/free-solid-svg-icons";
import {
  Components,
  listItemAvatarClasses,
  listItemIconClasses,
  listItemSecondaryActionClasses,
  listItemTextClasses,
  outlinedInputClasses,
  Theme,
} from "@mui/material";

import { FontAwesomeIcon } from "../../../fontawesome-icon";

export const MuiSelectThemeOptions: Components<Theme>["MuiSelect"] = {
  defaultProps: {
    IconComponent: (props) => <FontAwesomeIcon icon={faAngleDown} {...props} />,
    size: "medium",
  },
  styleOverrides: {
    select: ({ theme }) => ({
      display: "flex",
      alignItems: "center",

      // LIST ITEM ICON
      [`& .${listItemIconClasses.root}`]: {
        color: theme.palette.gray[50],
        minWidth: "unset",
        marginRight: 12,
        alignItems: "center",
      },

      // LIST ITEM AVATAR
      [`& .${listItemAvatarClasses.root}`]: {
        border: "2px solid transparent",
        marginRight: "12px",
        borderRadius: "50%",
        minWidth: "unset",
      },

      // LIST ITEM TEXT
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

      // LIST ITEM SECONDARY ACTION
      [`& .${listItemSecondaryActionClasses.root}`]: {
        right: theme.spacing(4.5),
        ...theme.typography.smallTextLabels,
        fontWeight: 500,
        color: theme.palette.gray[50],
      },

      "&:hover": {
        backgroundColor: theme.palette.gray[10],
      },
    }),
    outlined: ({ theme }) => ({
      [`& ~ .${outlinedInputClasses.notchedOutline}, &:hover ~ .${outlinedInputClasses.notchedOutline}`]:
        {
          borderColor: theme.palette.gray[30],
          boxShadow: theme.boxShadows.xs,
        },

      [`&:focus ~ .${outlinedInputClasses.notchedOutline}`]: {
        border: `1px solid ${theme.palette.blue[60]}`,
      },
    }),
    icon: ({ theme }) => ({
      color: theme.palette.gray[50],
      fontSize: 16,
      right: theme.spacing(1.5),
    }),
  },
};
