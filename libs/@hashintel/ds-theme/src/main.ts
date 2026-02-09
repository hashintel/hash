import { defineGlobalStyles, definePreset } from "@pandacss/dev";
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

      // Safe hover: only applies on devices that truly support hover
      // (mirrors Tailwind's hover variant which wraps in @media (hover: hover))
      // Use data-support-hover to trigger statically in stories
      supportHover: [
        "@media (hover: hover) and (pointer: fine)",
        "&:is(:hover, [data-support-hover])",
      ],

      // Focus-visible within: element has a descendant with focus-visible
      focusVisibleWithin:
        "&:is(:has(:focus-visible), [data-focus-visible-within])",

      // Inert: element or ancestor is inert (mirrors Tailwind's inert variant)
      inert: "&:is([inert], [inert] *, [data-inert])",

      // Group focus-visible-within: parent .group has a focus-visible descendant
      groupFocusVisibleWithin:
        ".group:is(:has(:focus-visible), [data-focus-visible-within]) &",

      // Peer focus-visible-within: sibling .peer has a focus-visible descendant
      peerFocusVisibleWithin:
        ".peer:is(:has(:focus-visible), [data-focus-visible-within]) ~ &",

      // User-valid / user-invalid: form validation after user interaction
      // (mirrors Tailwind's user-valid / user-invalid variants)
      userValid: "&:is(:user-valid, [data-user-valid])",
      userInvalid: "&:is(:user-invalid, [data-user-invalid])",

      // Pointer/input capability queries (mirrors Tailwind's pointer variants)
      // Use data-pointer-* to trigger statically in stories
      pointerFine: "@media (pointer: fine)",
      pointerCoarse: "@media (pointer: coarse)",
      pointerNone: "@media (pointer: none)",
      anyPointerFine: "@media (any-pointer: fine)",
      anyPointerCoarse: "@media (any-pointer: coarse)",

      // Interactive compound: ancestor matching a state (Tailwind's `in-*` pattern)
      // style children when _any_ ancestor matches
      inHover: ":where(:is(*:hover, [data-in-hover])) &",
      inFocus: ":where(:is(*:focus, [data-in-focus])) &",
      inFocusVisible: ":where(:is(*:focus-visible, [data-in-focus-visible])) &",
      inFocusWithin: ":where(:is(*:focus-within, [data-in-focus-within])) &",

      // Has-* compounds: parent matches when a descendant matches a state
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
      },
    },
  },
});

export default preset;
