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
 * Accent color tokens that use CSS custom properties for dynamic switching.
 *
 * These tokens resolve to CSS variables (e.g., `var(--colors-accent-9)`)
 * that can be dynamically remapped via a `data-accent` attribute with CSS
 * variable overrides.
 *
 * Usage: `css({ color: "accent.11" })` or `css({ bg: "accent.solid.bg" })`
 *
 * The accent inherits down the DOM tree, allowing nested components to
 * automatically pick up their parent's color scheme.
 *
 * Note: We use raw CSS var() values instead of token references because
 * Panda's colorPalette virtual tokens are only generated based on palette
 * usage in recipes, not as standalone referenceable tokens.
 */
const accentTokens = defineSemanticTokens.colors({
  accent: {
    // Raw scale (0-12) - default to blue, overridden by data-accent
    0: { value: "var(--colors-accent-0, var(--colors-blue-0))" },
    1: { value: "var(--colors-accent-1, var(--colors-blue-1))" },
    2: { value: "var(--colors-accent-2, var(--colors-blue-2))" },
    3: { value: "var(--colors-accent-3, var(--colors-blue-3))" },
    4: { value: "var(--colors-accent-4, var(--colors-blue-4))" },
    5: { value: "var(--colors-accent-5, var(--colors-blue-5))" },
    6: { value: "var(--colors-accent-6, var(--colors-blue-6))" },
    7: { value: "var(--colors-accent-7, var(--colors-blue-7))" },
    8: { value: "var(--colors-accent-8, var(--colors-blue-8))" },
    9: { value: "var(--colors-accent-9, var(--colors-blue-9))" },
    10: { value: "var(--colors-accent-10, var(--colors-blue-10))" },
    11: { value: "var(--colors-accent-11, var(--colors-blue-11))" },
    12: { value: "var(--colors-accent-12, var(--colors-blue-12))" },
    // Alpha scale
    a0: { value: "var(--colors-accent-a0, var(--colors-blue-a0))" },
    a1: { value: "var(--colors-accent-a1, var(--colors-blue-a1))" },
    a2: { value: "var(--colors-accent-a2, var(--colors-blue-a2))" },
    a3: { value: "var(--colors-accent-a3, var(--colors-blue-a3))" },
    a4: { value: "var(--colors-accent-a4, var(--colors-blue-a4))" },
    a5: { value: "var(--colors-accent-a5, var(--colors-blue-a5))" },
    a6: { value: "var(--colors-accent-a6, var(--colors-blue-a6))" },
    a7: { value: "var(--colors-accent-a7, var(--colors-blue-a7))" },
    a8: { value: "var(--colors-accent-a8, var(--colors-blue-a8))" },
    a9: { value: "var(--colors-accent-a9, var(--colors-blue-a9))" },
    a10: { value: "var(--colors-accent-a10, var(--colors-blue-a10))" },
    a11: { value: "var(--colors-accent-a11, var(--colors-blue-a11))" },
    a12: { value: "var(--colors-accent-a12, var(--colors-blue-a12))" },
    // Semantic variants (solid, subtle, surface, outline, plain)
    solid: {
      bg: {
        DEFAULT: {
          value: "var(--colors-accent-solid-bg, var(--colors-blue-solid-bg))",
        },
        hover: {
          value:
            "var(--colors-accent-solid-bg-hover, var(--colors-blue-solid-bg-hover))",
        },
      },
      fg: {
        DEFAULT: {
          value: "var(--colors-accent-solid-fg, var(--colors-blue-solid-fg))",
        },
      },
    },
    subtle: {
      bg: {
        DEFAULT: {
          value: "var(--colors-accent-subtle-bg, var(--colors-blue-subtle-bg))",
        },
        hover: {
          value:
            "var(--colors-accent-subtle-bg-hover, var(--colors-blue-subtle-bg-hover))",
        },
        active: {
          value:
            "var(--colors-accent-subtle-bg-active, var(--colors-blue-subtle-bg-active))",
        },
      },
      fg: {
        DEFAULT: {
          value: "var(--colors-accent-subtle-fg, var(--colors-blue-subtle-fg))",
        },
      },
    },
    surface: {
      bg: {
        DEFAULT: {
          value:
            "var(--colors-accent-surface-bg, var(--colors-blue-surface-bg))",
        },
        active: {
          value:
            "var(--colors-accent-surface-bg-active, var(--colors-blue-surface-bg-active))",
        },
      },
      border: {
        DEFAULT: {
          value:
            "var(--colors-accent-surface-border, var(--colors-blue-surface-border))",
        },
        hover: {
          value:
            "var(--colors-accent-surface-border-hover, var(--colors-blue-surface-border-hover))",
        },
      },
      fg: {
        DEFAULT: {
          value:
            "var(--colors-accent-surface-fg, var(--colors-blue-surface-fg))",
        },
      },
    },
    outline: {
      bg: {
        hover: {
          value:
            "var(--colors-accent-outline-bg-hover, var(--colors-blue-outline-bg-hover))",
        },
        active: {
          value:
            "var(--colors-accent-outline-bg-active, var(--colors-blue-outline-bg-active))",
        },
      },
      border: {
        DEFAULT: {
          value:
            "var(--colors-accent-outline-border, var(--colors-blue-outline-border))",
        },
      },
      fg: {
        DEFAULT: {
          value:
            "var(--colors-accent-outline-fg, var(--colors-blue-outline-fg))",
        },
      },
    },
    plain: {
      bg: {
        hover: {
          value:
            "var(--colors-accent-plain-bg-hover, var(--colors-blue-plain-bg-hover))",
        },
        active: {
          value:
            "var(--colors-accent-plain-bg-active, var(--colors-blue-plain-bg-active))",
        },
      },
      fg: {
        DEFAULT: {
          value: "var(--colors-accent-plain-fg, var(--colors-blue-plain-fg))",
        },
      },
    },
  },
});

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
          ...accentTokens,
          // Alias gray as neutral for component APIs
          neutral: gray,
        },
      },
    },
  },
});

export default preset;
