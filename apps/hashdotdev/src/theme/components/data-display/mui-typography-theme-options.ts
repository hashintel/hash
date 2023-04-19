import { Components, Theme } from "@mui/material";

export const MuiTypographyThemeOptions: Components<Theme>["MuiTypography"] = {
  defaultProps: {
    variantMapping: {
      hashLargeTitle: "h1",
      hashHeading1: "h1",
      hashHeading2: "h2",
      hashHeading3: "h3",
      hashHeading4: "h4",
      hashHeading5: "h5",
      hashBodyCopy: "p",
      hashLargeText: "p",
      hashSmallText: "p",
      hashSmallTextMedium: "p",
      hashSmallCaps: "span",
      hashFooterHeading: "h5",
      hashCode: "code",
    },
    variant: "hashBodyCopy",
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      /** Headers that come after headers shouldn't have a top margin */
      [`&[class*="MuiTypography-hashHeading"] + [class*="MuiTypography-hashHeading"]`]:
        {
          marginTop: 0,
        },
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
