/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiBreadcrumbsThemeOptions: Components<Theme>["MuiBreadcrumbs"] = {
  styleOverrides: {
    li: ({ theme }) => ({
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      fontSize: theme.typography.bpSmallCopy.fontSize,
      color: theme.palette.gray[70],
      "> a": {
        borderBottomColor: "transparent",
      },
      "&:not(:last-child)": {
        maxWidth: 150,
      },
      "&:last-child": {
        color: theme.palette.purple[700],
      },
    }),
  },
};
