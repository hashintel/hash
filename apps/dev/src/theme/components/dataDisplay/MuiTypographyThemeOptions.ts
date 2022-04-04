import { Components, Theme } from "@mui/material";

export const MuiTypographyThemeOptions: Components<Theme>["MuiTypography"] = {
  defaultProps: {
    // @todo need to set these
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

      hashBodyCopy: "p",
    },
    variant: "hashBodyCopy",
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      // @todo hover colours?
      "& a": {
        ...(ownerState.variant === "hashBodyCopy" && {
          fontWeight: 600,
          color: theme.palette.yellow[900],
          /**
           * @todo check if text decoration underline is sufficient –
           *       renders differently in figma
           */
          textDecoration: "underline",
        }),
      },
      ...(ownerState.variant === "hashSocialIconLink" && {
        "& svg": {
          fontSize: 20,
          color: theme.palette.gray[50],
        },
      }),
    }),
  },
};
