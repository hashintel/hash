import type {
  ColorToken,
  FontWeightToken,
  ShadowToken,
  SpacingToken,
  TextStyleToken,
} from "../styled-system/tokens/tokens";
import type { UtilityValues } from "../styled-system/types/prop-type";

export type SolidStep = ColorToken extends infer T
  ? T extends `neutral.s${infer S}`
    ? `s${S}`
    : never
  : never;

export type AlphaStep = ColorToken extends infer T
  ? T extends `neutral.a${infer S}`
    ? `a${S}`
    : never
  : never;

export type PaletteName = ColorToken extends infer T
  ? T extends `${infer P}.s00`
    ? Exclude<P, "black" | "white">
    : never
  : never;

export type BaseShadow = ShadowToken extends infer T
  ? T extends `inset-${string}`
    ? never
    : T extends `elevation.${string}`
      ? never
      : T
  : never;

export type InsetShadow = ShadowToken extends infer T
  ? T extends `inset-${infer _}`
    ? T
    : never
  : never;

export type ElevationLevel = ShadowToken extends infer T
  ? T extends `elevation.${infer L}.${infer _}`
    ? L
    : never
  : never;

export type ElevationScale = ShadowToken extends infer T
  ? T extends `elevation.${infer _}.${infer S}`
    ? S
    : never
  : never;

export type TextStyle = TextStyleToken;

/* TODO: expand to full-set of modifiers: leading, spacing, roundness */
export type Leading = UtilityValues["leading"];

export type { FontWeightToken, SpacingToken };
