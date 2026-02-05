import { definePreset, defineSemanticTokens } from "@pandacss/dev";
import {
  palettes,
  staticColors,
  blue,
  green,
  orange,
  red,
  gray,
} from "./theme/colors.gen";
import {
  spacing,
  fonts,
  fontWeights,
  fontSizes,
  lineHeights,
  radii,
} from "./theme/tokens.gen";

/**
 * Semantic color aliases composed from generated palettes.
 * This is where we define status mappings and global tokens.
 */
const semanticAliases = defineSemanticTokens.colors({
  fg: {
    DEFAULT: {
      value: { _light: "{colors.gray.12}", _dark: "{colors.gray.12}" },
    },
    muted: {
      value: { _light: "{colors.gray.11}", _dark: "{colors.gray.11}" },
    },
    subtle: {
      value: { _light: "{colors.gray.10}", _dark: "{colors.gray.10}" },
    },
  },
  canvas: { value: { _light: "{colors.gray.0}", _dark: "{colors.gray.0}" } },
  border: { value: { _light: "{colors.gray.4}", _dark: "{colors.gray.4}" } },
  status: {
    info: blue,
    success: green,
    warning: orange,
    error: red,
  },
});

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
      colors: staticColors,
    },
    extend: {
      semanticTokens: {
        colors: {
          ...palettes,
          ...semanticAliases,
          // Alias gray as neutral for component APIs
          neutral: gray,
        },
      },
    },
  },
});

export default preset;
