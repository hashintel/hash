import { Components, Theme } from "@mui/material";

export const MuiTypographyThemeOptions: Components<Theme>["MuiTypography"] = {
  defaultProps: {
    variantMapping: {
      hashLargeTitle: "h1",
      hashHeading1: "h1",
      hashHeading2: "h2",
      hashHeading4: "h4",
      hashBodyCopy: "p",
      hashLargeText: "p",
      hashSmallText: "p",
      hashSmallTextMedium: "p",
      hashSmallCaps: "span",
      hashFooterHeading: "h5",
    },
    variant: "hashBodyCopy",
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      "& a": {
        ...(ownerState.variant === "hashBodyCopy" && {
          fontWeight: 600,
          color: theme.palette.yellow[900],
          textDecoration: "underline",
        }),
      },
      ...(ownerState.variant === "hashSocialIconLink" && {
        fontSize: 0,

        "& a": {
          color: theme.palette.gray[50],
        },

        "& svg": {
          fontSize: 20,
        },
      }),
    }),
  },
};
