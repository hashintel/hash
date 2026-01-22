import { definePreset } from "@pandacss/dev";
import { colors } from "./theme/colors.gen";
import {
  spacing,
  fonts,
  fontWeights,
  fontSizes,
  lineHeights,
  radii,
} from "./theme/tokens.gen";

export const preset = definePreset({
  name: "@hashintel/ds-theme",
  conditions: {
    extend: {
      light: ":root &, .light &, [data-theme=light] &",
      dark: '.dark &, [data-theme="dark"] &',
    },
  },
  theme: {
    tokens: {
      spacing,
      fonts,
      fontWeights,
      fontSizes,
      lineHeights,
      radii,
    },
    extend: {
      semanticTokens: {
        colors,
      },
    },
  },
});

export default preset;
