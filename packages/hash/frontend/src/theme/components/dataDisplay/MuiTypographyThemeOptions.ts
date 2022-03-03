import { Components, Theme } from "@mui/material";
import { customColors } from "../../palette";

export const MuiTypographyThemeOptions: Components<Theme>["MuiTypography"] = {
  defaultProps: {
    variantMapping: {
      title: "h1",
      h1: "h1",
      h2: "h2",
      h3: "h3",
      h4: "h4",
      h5: "h5",
      mediumCaps: "h6",
      smallCaps: "h6",
      largeTextLabels: "span",
      regularTextParagaphs: "p",
      regularTextLabels: "span",
      smallTextLabels: "span",
      microText: "span",
    },
    variant: "regularTextParagaphs",
    color: customColors.gray[90],
  },
};
