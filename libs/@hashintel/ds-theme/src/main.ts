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

const statusPalettes = {
  status: {
    info: blue,
    success: green,
    warning: orange,
    error: red,
  },
};

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
      // see https://github.com/chakra-ui/panda/issues/3441#issuecomment-3642011828
      // @ts-expect-error -- `colorPalette` not recognized but it's legit
      colorPalette: {
        enabled: true,
        include: ["bg.*", "fg.*", "bd.*"],
      },
      semanticTokens: {
        colors: {
          ...basePalettes,
          ...statusPalettes,
        },
      },
    },
  },
});

export default preset;
