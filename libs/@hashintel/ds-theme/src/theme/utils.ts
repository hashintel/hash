/**
 * Palette contrast category:
 * - "normal": dark colors at step 9 (blue, red, green, etc.) — white fg on solid
 * - "bright": light/vivid colors at step 9 (yellow, orange, etc.) — dark fg on solid
 * - "neutral": gray-scale palettes — solid uses black/white instead of step 9
 */
export type PaletteKind = "normal" | "bright" | "neutral";

/**
 * Creates the bg/fg/bd semantic structure referencing a specific palette.
 * The palette must be a valid token path like "colors.blue" or "colors.neutral".
 *
 * bg — alpha-based layers from transparent (min) through surface/subtle/shaded/strong
 *       up to opaque solid; provides hover/active/disabled for each.
 *       bg.solid.fg provides the contrast text color for solid backgrounds.
 * canvas — solid-color equivalents of bg, using opaque s* steps instead of alpha a*.
 *          Use for surfaces that must not blend (popovers, dialogs, dropdowns).
 * fg — text hierarchy from max (strongest) through heading/body/muted/subtle,
 *       plus link.
 * bd — alpha-based borders at three weights: subtle, solid, strong.
 *
 * The `kind` parameter controls how bg.solid.fg is mapped to ensure proper text
 * contrast on solid backgrounds ("bright" palettes use neutral fg, others use s00).
 */
export function createSemanticSet(
  palette: string = "neutral",
  kind: PaletteKind = "normal",
) {
  const ps = (step: string) => ({ value: `{${palette}.${step}}` });

  const onSolid =
    kind === "bright"
      ? {
          value: {
            _light: "{colors.neutral.s120}",
            _dark: "{colors.neutral.s10}",
          },
        }
      : ps("s00");

  const bgSolid =
    kind === "neutral"
      ? {
          DEFAULT: ps("s125"),
          hover: ps("s120"),
          active: ps("s120"),
          disabled: ps("s60"),
          fg: onSolid,
        }
      : {
          DEFAULT: ps("s90"),
          hover: ps("s100"),
          active: ps("s100"),
          disabled: ps("s60"),
          fg: onSolid,
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
        DEFAULT: ps("a20"),
        hover: ps("a30"),
        active: ps("a40"),
        disabled: ps("a10"),
      },
      shaded: {
        DEFAULT: ps("a40"),
        hover: ps("a50"),
        active: ps("a55"),
        disabled: ps("a20"),
      },
      strong: {
        DEFAULT: ps("a60"),
        hover: ps("a70"),
        active: ps("a75"),
        disabled: ps("a40"),
      },
      solid: bgSolid,
    },
    canvas: {
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
        DEFAULT: ps("s20"),
        hover: ps("s30"),
        active: ps("s40"),
        disabled: ps("s10"),
      },
      shaded: {
        DEFAULT: ps("s40"),
        hover: ps("s50"),
        active: ps("s55"),
        disabled: ps("s20"),
      },
      strong: {
        DEFAULT: ps("s60"),
        hover: ps("s70"),
        active: ps("s75"),
        disabled: ps("s40"),
      },
      solid: bgSolid,
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
