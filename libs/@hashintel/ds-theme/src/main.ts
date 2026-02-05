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
import { createSemanticSet, withSemantics } from "./theme/utils";

/**
 * Wrap each base palette with semantic tokens (bg, fg, bd).
 * This is required for colorPalette switching to work - Panda copies the
 * structure from the target palette, so each must have bg.solid, fg.solid, etc.
 */
const palettes = Object.fromEntries(
  Object.entries(basePalettes).map(([name, tokens]) => [
    name,
    withSemantics(name, tokens as Record<string, unknown>),
  ]),
);

/** Status palette aliases - map semantic status names to color palettes */
const statusPalettes = {
  status: {
    info: withSemantics("blue", blue as Record<string, unknown>),
    success: withSemantics("green", green as Record<string, unknown>),
    warning: withSemantics("orange", orange as Record<string, unknown>),
    error: withSemantics("red", red as Record<string, unknown>),
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
          // @ts-expect-error - Panda accepts nested semantic token structures
          neutral: palettes["gray"],
        },
      },
    },
  },
});

export default preset;
