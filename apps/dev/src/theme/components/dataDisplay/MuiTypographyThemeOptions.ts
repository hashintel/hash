/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiTypographyThemeOptions: Components<Theme>["MuiTypography"] = {
  defaultProps: {
    variantMapping: {
      bpTitle: "h1",
      bpSubtitle: "p",
      bpHeading1: "h1",
      bpHeading2: "h2",
      bpHeading3: "h3",
      bpHeading4: "h4",
      bpSmallCaps: "p",
      bpLargeText: "p",
      bpBodyCopy: "p",
      bpSmallCopy: "span",
      bpMicroCopy: "span",
    },
    variant: "bpBodyCopy",
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      "& a": {
        ...(ownerState.variant === "bpBodyCopy" && {
          fontWeight: 600,
          color: theme.palette.purple[700],
          borderBottomWidth: 2,
          borderBottomColor: theme.palette.purple[700],
          borderBottomStyle: "solid",
          transition: theme.transitions.create("color"),
          ":hover": {
            color: theme.palette.purple[500],
            borderBottomColor: theme.palette.purple[500],
          },
        }),
        ...(ownerState.variant === "bpSmallCopy" && {
          color: "currentColor",
          borderBottomWidth: 2,
          borderBottomColor: "currentColor",
          borderBottomStyle: "solid",
          transition: theme.transitions.create("color"),
          ":hover": {
            color: theme.palette.purple[700],
            borderBottomColor: theme.palette.purple[700],
          },
        }),
      },
    }),
  },
};
