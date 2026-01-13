import { definePreset } from "@pandacss/dev";
import { colors } from "./theme/colors";
import {
  spacing,
  fonts,
  fontWeights,
  fontSizes,
  lineHeights,
  radii,
} from "./theme/tokens";

export const preset = definePreset({
  name: "@hashintel/ds-theme",
  conditions: {
    extend: {
      light: ":root &, .light &, [data-theme=light] &",
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
