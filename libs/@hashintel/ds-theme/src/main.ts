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

const globalCss = defineGlobalStyles({
  "html, body": {
    colorPalette: "neutral",
    fontFamily: "body",
    bg: "neutral.s00",
    color: "neutral.s120",

    "--roundness-factor-none": "0",
    "--roundness-factor-sm": "0.75",
    "--roundness-factor-md": "1",
    "--roundness-factor-lg": "1.5",
    "--roundness-factor-xl": "2",
    "--roundness-factor": "var(--roundness-factor-md)",

    "--leading-factor-tight": "0.9",
    "--leading-factor-normal": "1",
    "--leading-factor-loose": "1.1",
    "--leading-factor": "var(--leading-factor-normal)",

    "--density-factor-compact": "0.875",
    "--density-factor-normal": "1",
    "--density-factor-comfortable": "1.125",
    "--density-factor": "var(--density-factor-normal)",
  },
  '[data-roundness="none"]': {
    "--roundness-factor": "var(--roundness-factor-none)",
  },
  '[data-roundness="sm"]': {
    "--roundness-factor": "var(--roundness-factor-sm)",
  },
  '[data-roundness="md"]': {
    "--roundness-factor": "var(--roundness-factor-md)",
  },
  '[data-roundness="lg"]': {
    "--roundness-factor": "var(--roundness-factor-lg)",
  },
  '[data-roundness="xl"]': {
    "--roundness-factor": "var(--roundness-factor-xl)",
  },

  '[data-leading="tight"]': {
    "--leading-factor": "var(--leading-factor-tight)",
  },
  '[data-leading="normal"]': {
    "--leading-factor": "var(--leading-factor-normal)",
  },
  '[data-leading="loose"]': {
    "--leading-factor": "var(--leading-factor-loose)",
  },

  '[data-density="compact"]': {
    "--density-factor": "var(--density-factor-compact)",
  },
  '[data-density="normal"]': {
    "--density-factor": "var(--density-factor-normal)",
  },
  '[data-density="comfortable"]': {
    "--density-factor": "var(--density-factor-comfortable)",
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
        values: { tight: "tight", normal: "normal", loose: "loose" },
        transform(value: string) {
          return { "--leading-factor": `var(--leading-factor-${value})` };
        },
      },
      density: {
        className: "density",
        values: { compact: "compact", normal: "normal", comfortable: "comfortable" },
        transform(value: string) {
          return { "--density-factor": `var(--density-factor-${value})` };
        },
      },
      roundness: {
        className: "roundness",
        values: { none: "none", sm: "sm", md: "md", lg: "lg", xl: "xl" },
        transform(value: string) {
          return { "--roundness-factor": `var(--roundness-factor-${value})` };
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
            lineHeight:
              "calc(1em * 1.5 * var(--leading-factor, 1))",
            letterSpacing: "0.01em",
          },
        },
        sm: {
          value: {
            fontSize: "{fontSizes.sm}",
            lineHeight:
              "calc(1em * 1.5 * var(--leading-factor, 1))",
            letterSpacing: "0.005em",
          },
        },
        base: {
          value: {
            fontSize: "{fontSizes.base}",
            lineHeight:
              "calc(1em * 1.5 * var(--leading-factor, 1))",
            letterSpacing: "0em",
          },
        },
        lg: {
          value: {
            fontSize: "{fontSizes.lg}",
            lineHeight:
              "calc(1em * 1.5 * var(--leading-factor, 1))",
            letterSpacing: "-0.005em",
          },
        },
        xl: {
          value: {
            fontSize: "{fontSizes.xl}",
            lineHeight:
              "calc(1em * 1.5 * var(--leading-factor, 1))",
            letterSpacing: "-0.01em",
          },
        },
        "2xl": {
          value: {
            fontSize: "{fontSizes.2xl}",
            lineHeight:
              "calc(1em * 1.4 * var(--leading-factor, 1))",
            letterSpacing: "-0.015em",
          },
        },
        "3xl": {
          value: {
            fontSize: "{fontSizes.3xl}",
            lineHeight:
              "calc(1em * 1.3 * var(--leading-factor, 1))",
            letterSpacing: "-0.02em",
          },
        },
        "4xl": {
          value: {
            fontSize: "{fontSizes.4xl}",
            lineHeight:
              "calc(1em * 1.25 * var(--leading-factor, 1))",
            letterSpacing: "-0.025em",
          },
        },
      },
      // see https://github.com/chakra-ui/panda/issues/3441#issuecomment-3642011828
      // @ts-expect-error -- `colorPalette` not recognized but it's legit
      colorPalette: {
        enabled: true,
        include: ["bg.*", "fg.*", "bd.*", "status.*"],
      },
    },
  },
});

export default preset;
