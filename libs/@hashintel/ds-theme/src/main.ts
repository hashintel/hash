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
  presets: ["@pandacss/preset-base", "@pandacss/preset-panda"],
  conditions: {
    extend: {
      light: ":root &, .light &, [data-theme=light] &",
    },
  },
  theme: {
    extend: {
      tokens: {
        spacing,
        fonts,
        fontWeights,
        fontSizes,
        lineHeights,
        radii,
      },
      semanticTokens: {
        colors,
      },
    },
  },
});

export default preset;
