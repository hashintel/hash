/**
 * Palette contrast category:
 * - "normal": dark colors at step 9 (blue, red, green, etc.) — white fg on solid
 * - "bright": light/vivid colors at step 9 (yellow, orange, etc.) — dark fg on solid
 * - "neutral": gray-scale palettes — solid uses black/white instead of step 9
 */
export type PaletteKind = "normal" | "bright" | "neutral";

/**
 * Returns the foreground color to use on a "solid" background (bg.solid / bgSolid.solid).
 * Uses explicit _light/_dark values because solid backgrounds (s90 for colored,
 * s125 for neutral) don't fully invert at the crossover zone.
 *
 * - normal: s90 is dark/vivid in both modes → light text in both
 * - bright: s90 is vivid/light in light mode (dark text), vivid in dark mode (light text)
 * - neutral: solid is s125 which fully inverts → s00 auto-flips correctly
 */
function fgOnSolid(
  kind: PaletteKind,
  ps: (step: string) => { value: string },
): { value: string } | { value: { _light: string; _dark: string } } {
  switch (kind) {
    case "normal":
      return { value: { _light: ps("s00").value, _dark: ps("s125").value } };
    case "bright":
      return {
        value: { _light: "{colors.neutral.s120}", _dark: ps("s125").value },
      };
    case "neutral":
      return ps("s00");
  }
}

/**
 * Creates the bg/fg/bd semantic structure referencing a specific palette.
 * The palette must be a valid token path like "colors.blue" or "colors.neutral".
 *
 * bg — alpha-based layers from transparent (min) through surface/subtle/shaded
 *       up to opaque solid; provides hover/active/disabled for each.
 * bgSolid — solid-color equivalents of bg, using opaque s* steps instead of alpha a*.
 *           Use for surfaces that must not blend (popovers, dialogs, dropdowns).
 * fg — text hierarchy from max (strongest) through heading/body/muted/subtle,
 *       plus link and onSolid (contrast color for solid backgrounds).
 * bd — alpha-based borders at three weights: subtle, solid, strong.
 */
export function createSemanticSet(
  palette: string = "neutral",
  kind: PaletteKind = "normal",
) {
  const ps = (step: string) => ({ value: `{${palette}.${step}}` });

  const solidAccentStep = kind === "neutral" ? "s125" : "s90";
  const solidAccent = {
    DEFAULT: ps(solidAccentStep),
    hover: kind === "neutral" ? ps("s120") : ps("s100"),
    active: kind === "neutral" ? ps("s120") : ps("s100"),
    disabled: ps("s60"),
  };

  return {
    bg: {
      min: {
        DEFAULT: ps("a00"),
        hover: ps("a05"),
        active: ps("a10"),
        disabled: ps("a00"),
      },
      surface: {
        DEFAULT: ps("a10"),
        hover: ps("a15"),
        active: ps("a20"),
        disabled: ps("a05"),
      },
      subtle: {
        DEFAULT: ps("a30"),
        hover: ps("a40"),
        active: ps("a50"),
        disabled: ps("a15"),
      },
      shaded: {
        DEFAULT: ps("a50"),
        hover: ps("a60"),
        active: ps("a65"),
        disabled: ps("a30"),
      },
      solid: solidAccent,
    },
    bgSolid: {
      min: {
        DEFAULT: ps("s00"),
        hover: ps("s05"),
        active: ps("s10"),
        disabled: ps("s00"),
      },
      surface: {
        DEFAULT: ps("s10"),
        hover: ps("s15"),
        active: ps("s20"),
        disabled: ps("s05"),
      },
      subtle: {
        DEFAULT: ps("s30"),
        hover: ps("s40"),
        active: ps("s50"),
        disabled: ps("s15"),
      },
      shaded: {
        DEFAULT: ps("s50"),
        hover: ps("s60"),
        active: ps("s65"),
        disabled: ps("s30"),
      },
      solid: solidAccent,
    },
    fg: {
      max: ps("s125"),
      onSolid: fgOnSolid(kind, ps),
      heading: ps("s120"),
      body: {
        DEFAULT: ps("s115"),
        hover: ps("s120"),
        disabled: ps("s90"),
      },
      muted: {
        DEFAULT: ps("s100"),
        hover: ps("s110"),
        disabled: ps("s80"),
      },
      subtle: {
        DEFAULT: ps("s90"),
        hover: ps("s100"),
        disabled: ps("s70"),
      },
      link: {
        DEFAULT: ps("s110"),
        hover: ps("s120"),
        active: ps("s110"),
        disabled: ps("s90"),
      },
    },
    bd: {
      subtle: {
        DEFAULT: ps("a40"),
        hover: ps("a50"),
        active: ps("a50"),
        disabled: ps("a20"),
      },
      solid: {
        DEFAULT: ps("a60"),
        hover: ps("a70"),
        active: ps("a70"),
        disabled: ps("a40"),
      },
      strong: {
        DEFAULT: ps("a80"),
        hover: ps("a90"),
        active: ps("a90"),
        disabled: ps("a60"),
      },
    },
  };
}

/**
 * Wraps a base palette (s00-s120, a00-a120 scale) with semantic tokens (bg, fg, bd).
 * This allows colorPalette switching to work - each palette has the full structure.
 */
export function withSemantics<T extends Record<string, unknown>>(
  paletteName: string,
  baseTokens: T,
  kind: PaletteKind = "normal",
) {
  return {
    ...baseTokens,
    ...createSemanticSet(`colors.${paletteName}`, kind),
  };
}
