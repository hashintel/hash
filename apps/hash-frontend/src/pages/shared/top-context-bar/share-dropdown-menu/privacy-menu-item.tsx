import {
  listItemIconClasses,
  listItemTextClasses,
  menuItemClasses,
  styled,
} from "@mui/material";

import { MenuItem } from "../../../../shared/ui";

export const PrivacyStatusMenuItem = styled(MenuItem)(({ theme }) => ({
  [`&.${menuItemClasses.disabled}`]: {
    opacity: 1,
  },
  [`&.${menuItemClasses.selected}`]: {
    backgroundColor: theme.palette.gray[20],
    [`& .${listItemIconClasses.root}`]: {
      color: theme.palette.gray[50],
    },
    [`& .${listItemTextClasses.primary}`]: {
      color: theme.palette.gray[80],
    },
    [`& .${listItemTextClasses.secondary}`]: {
      color: theme.palette.gray[70],
    },
  },
}));
