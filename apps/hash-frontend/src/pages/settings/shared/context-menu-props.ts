import { listItemSecondaryActionClasses } from "@mui/material";

import { theme } from "@hashintel/design-system/theme";

import type { MenuProps } from "@mui/material";

export const contextMenuProps: Partial<MenuProps> = {
  anchorOrigin: {
    vertical: "bottom",
    horizontal: "left",
  },
  transformOrigin: {
    vertical: "top",
    horizontal: "left",
  },
  PaperProps: {
    elevation: 4,
    sx: {
      borderRadius: "6px",
      marginTop: 1,
      border: `1px solid ${theme.palette.gray["20"]}`,

      [`.${listItemSecondaryActionClasses.root}`]: {
        display: { xs: "none", md: "block" },
      },
    },
  },
};
