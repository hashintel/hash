import { defineGlobalStyles, definePreset } from "@pandacss/dev";
import pandaPreset from "@pandacss/preset-panda";

import {
  documentSurfaceStyles,
  fontPipelineCssVars,
} from "./preset/document-surface";
import {
  blue,
  fontSizes,
  fontWeights,
  green,
  orange,
  palettes as basePalettes,
  red,
  staticColors,
} from "./preset/theme";
import { createSemanticSet } from "./preset/theme/utils";

type TokenTree = Record<string, unknown>;
type TokenValueNode = TokenTree & { value: string };

const isObject = (value: unknown): value is TokenTree =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasStringValue = (node: TokenTree): node is TokenValueNode =>
  typeof Reflect.get(node, "value") === "string";

const scaleTokenValues = <T extends TokenTree>(
  tokens: T,
  factorVariable: string,
  { skipReferences = false }: { skipReferences?: boolean } = {},
): T => {
  const walk = (node: unknown): unknown => {
    if (!isObject(node)) {
      return node;
    }

    if (hasStringValue(node)) {
      const { value } = node;
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

export type PresetOptions = {
  /**
   * Scope the preset's global styles and light/dark conditions to a subtree
   * instead of the document root. When set, globalCss targets this selector
   * (instead of `html, body`) and includes `fontPipelineCssVars` so that
   * preflight and token vars resolve correctly within the subtree.
   *
   * @example ".petrinaut-root"
   */
  scope?: string;
};

/**
 * Create the `@hashintel/ds-components/preset` Panda CSS preset.
 *
 * Without arguments it behaves identically to the default export (document-level
 * global styles). Pass `{ scope }` to target a subtree instead.
 */
export function createPreset(options?: PresetOptions) {
  const scope = options?.scope;

  const surfaceSelector = scope ?? "html, body";
  const surfaceStyles = scope
    ? { ...fontPipelineCssVars, ...documentSurfaceStyles }
    : documentSurfaceStyles;

  const lightCondition = scope
    ? `${scope} &`
    : ':where(:root:not(.dark, [data-theme="dark"])) &, .light &, [data-theme=light] &';
  const darkCondition = scope
    ? `.dark ${scope} &, [data-theme='dark'] ${scope} &`
    : '.dark &, [data-theme="dark"] &';

  return definePreset({
    name: "@hashintel/ds-components/preset",
    globalCss: defineGlobalStyles({
      [surfaceSelector]: surfaceStyles,
    }),
    conditions: {
      extend: {
        light: lightCondition,
        dark: darkCondition,
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
        inFocusVisible:
          ":where(:is(*:focus-visible, [data-in-focus-visible])) &",
        inFocusWithin: ":where(:is(*:focus-within, [data-in-focus-within])) &",
        hasHover: "&:is(:has(*:hover), [data-has-hover])",
        hasFocus: "&:is(:has(*:focus), [data-has-focus])",
        hasFocusVisible:
          "&:is(:has(*:focus-visible), [data-has-focus-visible])",
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
          colors: staticColors,
          sizes: pandaPreset.theme.tokens.sizes,
          shadows: pandaPreset.theme.tokens.shadows,
          spacing: scaledSpacing,
          radii: scaledRadii,
          lineHeights:
            scaledLineHeights as typeof pandaPreset.theme.tokens.lineHeights,
        },
        semanticTokens: {
          colors: {
            DEFAULT: createSemanticSet("colors.neutral", "neutral"),
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
          include: ["bg.*", "bgSolid.*", "fg.*", "bd.*", "status.*"],
        },
      },
    },
  });
}

/**
 * Returns the Panda config properties needed to scope the design system to a
 * CSS subtree. Spread the result into `defineConfig()`.
 *
 * Handles `preflight`, `cssVarRoot`, `presets`, and scoped `conditions` /
 * `globalCss` inside the preset — the consumer only needs to add their own
 * `include`, `theme.extend`, etc.
 */
export function scopedThemeConfig(scope: string) {
  return {
    preflight: { scope } as const,
    cssVarRoot: scope,
    presets: [createPreset({ scope })],
  };
}

export const preset = createPreset();
export default preset;
