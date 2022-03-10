/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiSkeletonThemeOptions: Components<Theme>["MuiSkeleton"] = {
  styleOverrides: {
    root: ({ theme }) => ({
      backgroundColor: theme.palette.gray["20"],
    }),
  },
};
