import type {
  ColorToken,
  FontWeightToken,
  ShadowToken,
  SpacingToken,
} from "@hashintel/ds-helpers/tokens";

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

export type TextStyle =
  | "xs"
  | "sm"
  | "base"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl";

export type Leading = "tight" | "normal" | "loose";
export type Density = "compact" | "normal" | "comfortable";
export type Roundness = "none" | "sm" | "md" | "lg" | "xl";

export type { FontWeightToken, SpacingToken };
