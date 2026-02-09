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
import { fontWeights, fontSizes, lineHeights, radii } from "./theme/tokens.gen";

const globalCss = defineGlobalStyles({
  "html, body": {
    colorPalette: "neutral",
    fontFamily: "body",
    bg: "neutral.s00",
    color: "neutral.s120",
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
        values: { tight: "1", normal: "1.5", loose: "1.75" },
        transform(value: string) {
          return { "--leading": value };
        },
      },
    },
  },
  theme: {
    extend: {
      tokens: {
        spacing: pandaPreset.theme.tokens.spacing,
        sizes: pandaPreset.theme.tokens.sizes,
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
        shadows: pandaPreset.theme.tokens.shadows,
      },
      // see https://github.com/chakra-ui/panda/issues/3441#issuecomment-3642011828
      // @ts-expect-error -- `colorPalette` not recognized but it's legit
      colorPalette: {
        enabled: true,
        include: ["bg.*", "fg.*", "bd.*", "status.*"],
      },
      textStyles: {
        xs: {
          value: {
            fontSize: "{fontSizes.xs}",
            lineHeight: "calc(1em * var(--leading, 1.5))",
            letterSpacing: "0.01em",
          },
        },
        sm: {
          value: {
            fontSize: "{fontSizes.sm}",
            lineHeight: "calc(1em * var(--leading, 1.5))",
            letterSpacing: "0.005em",
          },
        },
        base: {
          value: {
            fontSize: "{fontSizes.base}",
            lineHeight: "calc(1em * var(--leading, 1.5))",
            letterSpacing: "0em",
          },
        },
        lg: {
          value: {
            fontSize: "{fontSizes.lg}",
            lineHeight: "calc(1em * var(--leading, 1.5))",
            letterSpacing: "-0.005em",
          },
        },
        xl: {
          value: {
            fontSize: "{fontSizes.xl}",
            lineHeight: "calc(1em * var(--leading, 1.5))",
            letterSpacing: "-0.01em",
          },
        },
        "2xl": {
          value: {
            fontSize: "{fontSizes.2xl}",
            lineHeight: "calc(1em * var(--leading, 1.4))",
            letterSpacing: "-0.015em",
          },
        },
        "3xl": {
          value: {
            fontSize: "{fontSizes.3xl}",
            lineHeight: "calc(1em * var(--leading, 1.3))",
            letterSpacing: "-0.02em",
          },
        },
        "4xl": {
          value: {
            fontSize: "{fontSizes.4xl}",
            lineHeight: "calc(1em * var(--leading, 1.25))",
            letterSpacing: "-0.025em",
          },
        },
      },
      semanticTokens: {
        colors: {
          ...basePalettes,
          status: {
            info: blue,
            success: green,
            warning: orange,
            error: red,
          },
        },
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
    },
  },
});

export default preset;
