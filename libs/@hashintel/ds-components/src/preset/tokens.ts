import pandaPreset from "@pandacss/preset-panda";

import {
  blue,
  fontSizes,
  fontWeights,
  green,
  orange,
  palettes as basePalettes,
  red,
  staticColors,
} from "./tokens/gen";
import { durations } from "./tokens/stubs/durations";
import { zIndex } from "./tokens/stubs/z-index";
import { createSemanticSet } from "./tokens/utils";

type TokenTree = Record<string, unknown>;
type TokenValueNode = TokenTree & { value: string };

const isObject = (value: unknown): value is TokenTree =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasStringValue = (node: TokenTree): node is TokenValueNode =>
  typeof Reflect.get(node, "value") === "string";

const scaleTokenValues = <T extends TokenTree>(
  tokenTree: T,
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

  return walk(tokenTree) as T;
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

/**
 * Each font token reads a `--salt-font-*` variable, which a host sets at or
 * above the element the theme is applied to in order to use its own font. Only
 * a host declares these variables, so no rule of the preset competes with the
 * host's value in the cascade.
 *
 * Unset, `body` resolves to the system font and `mono` to the system
 * monospace font.
 */
const fonts = {
  body: {
    value: "var(--salt-font-body, ui-sans-serif), system-ui, sans-serif",
  },
  mono: {
    value:
      "var(--salt-font-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace",
  },
};

export const tokens = {
  fontSizes,
  fontWeights,
  fonts,
  sizes: pandaPreset.theme.tokens.sizes,
  shadows: pandaPreset.theme.tokens.shadows,
  spacing: scaledSpacing,
  radii: scaledRadii,
  lineHeights: scaledLineHeights as typeof pandaPreset.theme.tokens.lineHeights,
  zIndex,
  durations,
};

export const semanticTokens = {
  colors: {
    DEFAULT: createSemanticSet("colors.neutral", "neutral"),
    ...staticColors,
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
};
