import { defineGlobalStyles, definePreset } from "@pandacss/dev";
import pandaPreset from "@pandacss/preset-panda";
import {
  palettes as basePalettes,
  staticColors,
  blue,
  green,
  orange,
  red,
} from "./theme/colors.gen";
import { fontWeights, fontSizes } from "./theme/tokens.gen";
import { createSemanticSet } from "./theme/utils";

type TokenTree = Record<string, unknown>;

const isObject = (value: unknown): value is TokenTree =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const scaleTokenValues = <T extends TokenTree>(
  tokens: T,
  factorVariable: string,
  { skipReferences = false }: { skipReferences?: boolean } = {},
): T => {
  const walk = (node: unknown): unknown => {
    if (!isObject(node)) {
      return node;
    }

    if ("value" in node && typeof node["value"] === "string") {
      const value = node["value"];
      if (skipReferences && value.includes("{")) {
        return node;
      }

      return {
        ...node,
        value: `calc(${value} * var(${factorVariable}, 1))`,
      };
    }

    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, walk(value)]),
    );
  };

  return walk(tokens) as T;
};

const scaledSpacing = scaleTokenValues(
  pandaPreset.theme.tokens.spacing,
  "--density-factor",
);
const scaledRadii = scaleTokenValues(
  pandaPreset.theme.tokens.radii,
  "--roundness-factor",
);
const scaledLineHeights = scaleTokenValues(
  pandaPreset.theme.tokens.lineHeights as TokenTree,
  "--leading-factor",
);

const globalCss = defineGlobalStyles({
  "html, body": {
    colorPalette: "neutral",
    fontFamily: "body",
    bg: "neutral.s00",
    color: "fg.heading",
    "--roundness-factor": "1",
    "--leading-factor": "1",
    "--density-factor": "1",
  },
});

export const preset = definePreset({
  name: "@hashintel/ds-theme",
  globalCss,
  conditions: {
    extend: {
      light: ":root &, .light &, [data-theme=light] &",
      dark: '.dark &, [data-theme="dark"] &',

      supportHover: [
        "@media (hover: hover) and (pointer: fine)",
        "&:is(:hover, [data-support-hover])",
      ],

      focusVisibleWithin:
        "&:is(:has(:focus-visible), [data-focus-visible-within])",

      inert: "&:is([inert], [inert] *, [data-inert])",

      groupFocusVisibleWithin:
        ".group:is(:has(:focus-visible), [data-focus-visible-within]) &",

      peerFocusVisibleWithin:
        ".peer:is(:has(:focus-visible), [data-focus-visible-within]) ~ &",

      userValid: "&:is(:user-valid, [data-user-valid])",
      userInvalid: "&:is(:user-invalid, [data-user-invalid])",

      pointerFine: "@media (pointer: fine)",
      pointerCoarse: "@media (pointer: coarse)",
      pointerNone: "@media (pointer: none)",
      anyPointerFine: "@media (any-pointer: fine)",
      anyPointerCoarse: "@media (any-pointer: coarse)",

      inHover: ":where(:is(*:hover, [data-in-hover])) &",
      inFocus: ":where(:is(*:focus, [data-in-focus])) &",
      inFocusVisible: ":where(:is(*:focus-visible, [data-in-focus-visible])) &",
      inFocusWithin: ":where(:is(*:focus-within, [data-in-focus-within])) &",

      hasHover: "&:is(:has(*:hover), [data-has-hover])",
      hasFocus: "&:is(:has(*:focus), [data-has-focus])",
      hasFocusVisible: "&:is(:has(*:focus-visible), [data-has-focus-visible])",
      hasFocusWithin: "&:is(:has(*:focus-within), [data-has-focus-within])",
      hasChecked: "&:is(:has(*:checked), [data-has-checked])",
    },
  },
  utilities: {
    extend: {
      leading: {
        className: "leading",
        values: { tight: "0.9", normal: "1", loose: "1.1" },
        transform(value: string) {
          return { "--leading-factor": value };
        },
      },
      density: {
        className: "density",
        values: { compact: "0.75", normal: "1", comfortable: "1.25" },
        transform(value: string) {
          return { "--density-factor": value };
        },
      },
      roundness: {
        className: "roundness",
        values: { none: "0", sm: "0.75", md: "1", lg: "1.5", xl: "2" },
        transform(value: string) {
          return { "--roundness-factor": value };
        },
      },
    },
  },
  theme: {
    extend: {
      tokens: {
        /* typography */
        fontSizes,
        fontWeights,
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
        /* static tokens */
        colors: staticColors,
        sizes: pandaPreset.theme.tokens.sizes,
        shadows: pandaPreset.theme.tokens.shadows,
        /* SCALED tokens */
        spacing: scaledSpacing,
        radii: scaledRadii,
        lineHeights:
          scaledLineHeights as typeof pandaPreset.theme.tokens.lineHeights,
      },
      semanticTokens: {
        /* semantic colors */
        colors: {
          DEFAULT: createSemanticSet("colors.neutral"),
          ...basePalettes,
          status: {
            info: blue,
            success: green,
            warning: orange,
            error: red,
          },
        },
        /* semantic shadows */
        shadows: {
          elevation: {
            drop: {
              macro: { value: "{shadows.xs}" },
              micro: { value: "{shadows.2xs}" },
            },
            lift: {
              macro: { value: "{shadows.sm}" },
              micro: { value: "{shadows.xs}" },
            },
            raise: {
              macro: { value: "{shadows.md}" },
              micro: { value: "{shadows.sm}" },
            },
            float: {
              macro: { value: "{shadows.lg}" },
              micro: { value: "{shadows.md}" },
            },
          },
        },
      },
      textStyles: {
        xs: {
          value: {
            fontSize: "{fontSizes.xs}",
            lineHeight: "calc(1em * 1.6 * var(--leading-factor, 1))",
            letterSpacing: "0.01em",
          },
        },
        sm: {
          value: {
            fontSize: "{fontSizes.sm}",
            lineHeight: "calc(1em * 1.6 * var(--leading-factor, 1))",
            letterSpacing: "0.005em",
          },
        },
        base: {
          value: {
            fontSize: "{fontSizes.base}",
            lineHeight: "calc(1em * 1.5 * var(--leading-factor, 1))",
            letterSpacing: "0em",
          },
        },
        lg: {
          value: {
            fontSize: "{fontSizes.lg}",
            lineHeight: "calc(1em * 1.5 * var(--leading-factor, 1))",
            letterSpacing: "-0.005em",
          },
        },
        xl: {
          value: {
            fontSize: "{fontSizes.xl}",
            lineHeight: "calc(1em * 1.4 * var(--leading-factor, 1))",
            letterSpacing: "-0.01em",
          },
        },
        "2xl": {
          value: {
            fontSize: "{fontSizes.2xl}",
            lineHeight: "calc(1em * 1.4 * var(--leading-factor, 1))",
            letterSpacing: "-0.015em",
          },
        },
        "3xl": {
          value: {
            fontSize: "{fontSizes.3xl}",
            lineHeight: "calc(1em * 1.3 * var(--leading-factor, 1))",
            letterSpacing: "-0.02em",
          },
        },
        "4xl": {
          value: {
            fontSize: "{fontSizes.4xl}",
            lineHeight: "calc(1em * 1.3 * var(--leading-factor, 1))",
            letterSpacing: "-0.025em",
          },
        },
      },
      // see https://github.com/chakra-ui/panda/issues/3441#issuecomment-3642011828
      // @ts-expect-error -- `colorPalette` not in PartialTheme types but works at runtime
      colorPalette: {
        enabled: true,
        include: ["bg.*", "fg.*", "bd.*", "status.*"],
      },
    },
  },
});

export default preset;
