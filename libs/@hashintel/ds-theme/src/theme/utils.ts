/**
 * Palette contrast category:
 * - "normal": dark colors at step 9 (blue, red, green, etc.) — white fg on solid
 * - "bright": light/vivid colors at step 9 (yellow, orange, etc.) — dark fg on solid
 * - "neutral": gray-scale palettes — solid uses black/white instead of step 9
 */
export type PaletteKind = "normal" | "bright" | "neutral";

/**
 * Step number at which the foreground contrast color flips.
 * Below this step: dark text (s125). At or above: light text (s00).
 * Bright palettes have additional exceptions — see BRIGHT_FLIPBACK_STEPS.
 */
const CONTRAST_FLIP_STEP = 80;

/**
 * Steps in bright palettes where the contrast flips back to dark text,
 * even though they are at or above CONTRAST_FLIP_STEP.
 * These steps are vivid/light enough to need dark foreground.
 */
const BRIGHT_FLIPBACK_STEPS = [90, 95, 100];

/**
 * Returns the contrast foreground token for a given step number and palette kind.
 * - Below CONTRAST_FLIP_STEP → dark text (palette's s125)
 * - At or above CONTRAST_FLIP_STEP → light text (palette's s00)
 * - Bright palettes at BRIGHT_FLIPBACK_STEPS → dark text (neutral)
 */
function contrastFg(
  stepNum: number,
  kind: PaletteKind,
  ps: (step: string) => { value: string },
): { value: string | { _light: string; _dark: string } } {
  if (stepNum < CONTRAST_FLIP_STEP) {
    return ps("s125");
  }
  if (kind === "bright" && BRIGHT_FLIPBACK_STEPS.includes(stepNum)) {
    return {
      value: {
        _light: "{colors.neutral.s120}",
        _dark: "{colors.neutral.s10}",
      },
    };
  }
  return ps("s00");
}

/**
 * Extracts the numeric part from a step key like "a30" or "s90".
 */
function stepNum(step: string): number {
  return Number(step.replace(/^[as]/, ""));
}

/**
 * Creates the bg/fg/bd semantic structure referencing a specific palette.
 * The palette must be a valid token path like "colors.blue" or "colors.neutral".
 *
 * bg — alpha-based layers from transparent (min) through surface/subtle/shaded
 *       up to opaque solid; provides hover/active/disabled for each.
 *       Each category includes a .fg contrast text color determined by the
 *       CONTRAST_FLIP_STEP threshold.
 * bgSolid — solid-color equivalents of bg, using opaque s* steps instead of alpha a*.
 *           Use for surfaces that must not blend (popovers, dialogs, dropdowns).
 * fg — text hierarchy from max (strongest) through heading/body/muted/subtle,
 *       plus link.
 * bd — alpha-based borders at three weights: subtle, solid, strong.
 */
export function createSemanticSet(
  palette: string = "neutral",
  kind: PaletteKind = "normal",
) {
  const ps = (step: string) => ({ value: `{${palette}.${step}}` });
  const cfg = (step: string) => contrastFg(stepNum(step), kind, ps);

  const solidAccentStep = kind === "neutral" ? "s125" : "s90";
  const solidAccent = {
    DEFAULT: ps(solidAccentStep),
    hover: kind === "neutral" ? ps("s120") : ps("s100"),
    active: kind === "neutral" ? ps("s120") : ps("s100"),
    disabled: ps("s60"),
    fg: cfg(solidAccentStep),
  };

  return {
    bg: {
      min: {
        DEFAULT: ps("a00"),
        hover: ps("a05"),
        active: ps("a10"),
        disabled: ps("a00"),
        fg: cfg("a00"),
      },
      surface: {
        DEFAULT: ps("a10"),
        hover: ps("a15"),
        active: ps("a20"),
        disabled: ps("a05"),
        fg: cfg("a10"),
      },
      subtle: {
        DEFAULT: ps("a30"),
        hover: ps("a40"),
        active: ps("a50"),
        disabled: ps("a15"),
        fg: cfg("a30"),
      },
      shaded: {
        DEFAULT: ps("a50"),
        hover: ps("a60"),
        active: ps("a65"),
        disabled: ps("a30"),
        fg: cfg("a50"),
      },
      solid: solidAccent,
    },
    bgSolid: {
      min: {
        DEFAULT: ps("s00"),
        hover: ps("s05"),
        active: ps("s10"),
        disabled: ps("s00"),
        fg: cfg("s00"),
      },
      surface: {
        DEFAULT: ps("s10"),
        hover: ps("s15"),
        active: ps("s20"),
        disabled: ps("s05"),
        fg: cfg("s10"),
      },
      subtle: {
        DEFAULT: ps("s30"),
        hover: ps("s40"),
        active: ps("s50"),
        disabled: ps("s15"),
        fg: cfg("s30"),
      },
      shaded: {
        DEFAULT: ps("s50"),
        hover: ps("s60"),
        active: ps("s65"),
        disabled: ps("s30"),
        fg: cfg("s50"),
      },
      solid: solidAccent,
    },
    fg: {
      max: ps("s125"),
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
