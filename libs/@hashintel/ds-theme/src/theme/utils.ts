/**
 * Creates the bg/fg/bd semantic structure referencing a specific palette.
 * The palette must be a valid token path like "colors.blue" or "colors.neutral".
 */
export function createSemanticSet(palette: string) {
  const ps = (step: string) => ({ value: `{${palette}.${step}}` });

  return {
    bg: {
      solid: {
        DEFAULT: ps("s90"),
        hover: ps("s100"),
        active: ps("s100"),
        disabled: ps("s60"),
      },
      surface: {
        DEFAULT: ps("a20"),
        hover: ps("a30"),
        active: ps("a40"),
        disabled: ps("a20"),
      },
      muted: {
        DEFAULT: ps("s30"),
        hover: ps("s40"),
        active: ps("s50"),
        disabled: ps("s20"),
      },
      subtle: {
        DEFAULT: ps("a30"),
        hover: ps("a40"),
        active: ps("a50"),
        disabled: ps("a20"),
      },
    },
    fg: {
      solid: { DEFAULT: { value: { _light: "white", _dark: "white" } } },
      DEFAULT: ps("s120"),
      muted: {
        DEFAULT: ps("s110"),
        hover: ps("s120"),
        disabled: ps("s90"),
      },
      subtle: {
        DEFAULT: ps("s100"),
        hover: ps("s110"),
        disabled: ps("s80"),
      },
      link: {
        DEFAULT: ps("s110"),
        hover: ps("s120"),
        active: ps("s110"),
        disabled: ps("s90"),
      },
    },
    bd: {
      solid: {
        DEFAULT: ps("s70"),
        hover: ps("s80"),
        active: ps("s80"),
        disabled: ps("s50"),
      },
      subtle: {
        DEFAULT: ps("s60"),
        hover: ps("s70"),
        active: ps("s70"),
        disabled: ps("s40"),
      },
      muted: {
        DEFAULT: ps("a60"),
        hover: ps("a70"),
        active: ps("a70"),
        disabled: ps("a40"),
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
) {
  return {
    ...baseTokens,
    ...createSemanticSet(`colors.${paletteName}`),
  };
}
