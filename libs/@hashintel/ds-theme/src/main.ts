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
  fontWeights,
  fontSizes,
  lineHeights,
  radii,
} from "./theme/tokens.gen";

/**
 * Neutral semantic tokens - always gray-based, never switch with colorPalette.
 *
 * These provide default colors for text, backgrounds, and borders when
 * no colorPalette context is set.
 *
 * For palette-relative colors, use colorPalette.bg.*, colorPalette.fg.*, etc.
 */
const neutralTokens = defineSemanticTokens.colors({
  // Background tokens (neutral)
  bg: {
    DEFAULT: { value: { _light: "{colors.gray.0}", _dark: "{colors.gray.0}" } },
    muted: { value: { _light: "{colors.gray.3}", _dark: "{colors.gray.3}" } },
    subtle: { value: { _light: "{colors.gray.2}", _dark: "{colors.gray.2}" } },
  },
  // Foreground/text tokens (neutral)
  fg: {
    DEFAULT: {
      value: { _light: "{colors.gray.12}", _dark: "{colors.gray.12}" },
    },
    muted: { value: { _light: "{colors.gray.11}", _dark: "{colors.gray.11}" } },
    subtle: {
      value: { _light: "{colors.gray.10}", _dark: "{colors.gray.10}" },
    },
  },
  // Border tokens (neutral)
  bd: {
    DEFAULT: { value: { _light: "{colors.gray.6}", _dark: "{colors.gray.6}" } },
    muted: { value: { _light: "{colors.gray.5}", _dark: "{colors.gray.5}" } },
    subtle: { value: { _light: "{colors.gray.4}", _dark: "{colors.gray.4}" } },
  },
  // Canvas is the pure background (white in light, black in dark)
  canvas: { value: { _light: "{colors.gray.0}", _dark: "{colors.gray.0}" } },
});

/**
 * Status palette aliases - map semantic status names to color palettes.
 * These inherit all the palette's tokens (bg, fg, bd variants).
 */
const statusAliases = defineSemanticTokens.colors({
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
      fonts: {
        display: { value: "var(--font-inter-tight), Inter Tight, ui-sans-serif, system-ui, sans-serif" },
        body: { value: "var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif" },
        mono: { value: "var(--font-geist-mono), Geist Mono, ui-monospace, SFMono-Regular, monospace" },
      },
      fontWeights,
      fontSizes,
      lineHeights,
      radii,
      colors: staticColors,
    },
    extend: {
      semanticTokens: {
        colors: {
          // All color palettes (blue, red, gray, etc.) with their bg/fg/bd variants
          ...palettes,
          // Neutral defaults (bg, fg, bd at top level - always gray-based)
          ...neutralTokens,
          // Status aliases (status.info, status.error, etc.)
          ...statusAliases,
          // Alias gray as neutral for component APIs
          neutral: gray,
        },
      },
    },
  },
});

export default preset;
