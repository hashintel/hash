import { definePreset } from "@pandacss/dev";
import {
  palettes as basePalettes,
  staticColors,
  blue,
  green,
  orange,
  red,
} from "./theme/colors.gen";
import {
  spacing,
  fontWeights,
  fontSizes,
  lineHeights,
  radii,
} from "./theme/tokens.gen";
import { createSemanticSet } from "./theme/utils";

/**
 * Base palettes already include semantic tokens (bg, fg, bd) for colorPalette.
 */
const palettes = basePalettes;

/** Status palette aliases - map semantic status names to color palettes */
const statusPalettes = {
  status: {
    info: blue,
    success: green,
    warning: orange,
    error: red,
  },
};

/** Neutral semantic tokens - gray-based defaults when no colorPalette is set */
const neutralSemantics = createSemanticSet("colors.neutral");

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
          // Palettes with semantic tokens (0-12, a0-a12 + bg, fg, bd)
          ...palettes,
          // Status aliases (status.info, status.error, etc.)
          ...statusPalettes,
          // Neutral defaults (bg.*, fg.*, bd.* at top level)
          ...neutralSemantics,
          // Alias gray as neutral for colorPalette references
          neutral: palettes["gray"],
        },
      },
    },
  },
});

export default preset;
