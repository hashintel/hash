import { definePreset } from "@pandacss/dev";
import { colors } from "./theme/colors";

export const preset = definePreset({
  name: "@hashintel/ds-theme",
  conditions: {
    light: "[data-theme=light] &, .light &",
    dark: "[data-theme=dark] &, .dark &",
  },
  theme: {
    extend: {
      semanticTokens: {
        colors,
      },
    },
  },
});

export default preset;
