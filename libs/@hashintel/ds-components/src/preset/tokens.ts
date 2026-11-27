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
/**
 * The Panda radius names with a 10px step added at `xl`, so every name from
 * `xl` up is one step smaller than its Panda value.
 */
const scaledRadii = scaleTokenValues(
  {
    xs: { value: "0.125rem" },
    sm: { value: "0.25rem" },
    md: { value: "0.375rem" },
    lg: { value: "0.5rem" },
    xl: { value: "0.625rem" },
    "2xl": { value: "0.75rem" },
    "3xl": { value: "1rem" },
    "4xl": { value: "1.5rem" },
    full: { value: "9999px" },
  },
  "--roundness-factor",
);
const scaledLineHeights = scaleTokenValues(
  pandaPreset.theme.tokens.lineHeights as TokenTree,
  "--leading-factor",
);

export const tokens = {
  fontSizes,
  fontWeights,
  fonts: {
    display: {
      value:
        "var(--font-inter-tight), Inter Tight, ui-sans-serif, system-ui, sans-serif",
    },
    body: {
      value: "var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif",
    },
    mono: {
      value:
        "var(--font-geist-mono), Geist Mono, ui-monospace, SFMono-Regular, monospace",
    },
  },
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
