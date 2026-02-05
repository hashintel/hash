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
import { createSemanticSet } from "./theme/utils";

/** Status palette aliases - map semantic status names to color palettes */
const statusPalettes = defineSemanticTokens.colors({
  status: {
    info: blue,
    success: green,
    warning: orange,
    error: red,
  },
});

/** Neutral semantic tokens - gray-based defaults when no colorPalette is set */
const neutralSemantics = createSemanticSet("colors.neutral");

/** ColorPalette virtual tokens - dynamically remapped based on active palette */
const paletteSemantics = defineSemanticTokens.colors({
  colorPalette: createSemanticSet("colorPalette"),
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
        display: {
          value:
            "var(--font-inter-tight), Inter Tight, ui-sans-serif, system-ui, sans-serif",
        },
        body: {
          value:
            "var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif",
        },
        mono: {
          value:
            "var(--font-geist-mono), Geist Mono, ui-monospace, SFMono-Regular, monospace",
        },
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
          // Base palettes (just scales: 0-12, a0-a12)
          ...palettes,
          // Status aliases (status.info, status.error, etc.)
          ...statusPalettes,
          // Neutral defaults (bg.*, fg.*, bd.* at top level)
          ...neutralSemantics,
          // ColorPalette virtual tokens (colorPalette.bg.*, etc.)
          ...paletteSemantics,
          // Alias gray as neutral for colorPalette references
          neutral: gray,
        },
      },
    },
  },
});

export default preset;
