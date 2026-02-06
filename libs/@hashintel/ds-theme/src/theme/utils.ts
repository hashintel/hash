/**
 * Creates the bg/fg/bd semantic structure referencing a specific palette.
 * The palette must be a valid token path like "colors.blue" or "colors.neutral".
 */
export function createSemanticSet(palette: string) {
  const ps = (step: string) => ({ value: `{${palette}.${step}}` });

  return {
    bg: {
      solid: {
        DEFAULT: ps("90"),
        hover: ps("100"),
        active: ps("100"),
        disabled: ps("60"),
      },
      surface: {
        DEFAULT: ps("a20"),
        hover: ps("a30"),
        active: ps("a40"),
        disabled: ps("a20"),
      },
      muted: {
        DEFAULT: ps("30"),
        hover: ps("40"),
        active: ps("50"),
        disabled: ps("20"),
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
      DEFAULT: ps("120"),
      muted: {
        DEFAULT: ps("110"),
        hover: ps("120"),
        disabled: ps("90"),
      },
      subtle: {
        DEFAULT: ps("100"),
        hover: ps("110"),
        disabled: ps("80"),
      },
      link: {
        DEFAULT: ps("110"),
        hover: ps("120"),
        active: ps("110"),
        disabled: ps("90"),
      },
    },
    bd: {
      solid: {
        DEFAULT: ps("70"),
        hover: ps("80"),
        active: ps("80"),
        disabled: ps("50"),
      },
      subtle: {
        DEFAULT: ps("60"),
        hover: ps("70"),
        active: ps("70"),
        disabled: ps("40"),
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
 * Wraps a base palette (00-120, a00-a120 scale) with semantic tokens (bg, fg, bd).
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
