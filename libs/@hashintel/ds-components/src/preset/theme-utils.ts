type PaletteKind = "normal" | "bright" | "neutral";

function fgOnSolid(
  kind: PaletteKind,
  paletteStep: (step: string) => { value: string },
): { value: string } | { value: { _light: string; _dark: string } } {
  switch (kind) {
    case "bright":
      return {
        value: {
          _dark: paletteStep("s00").value,
          _light: paletteStep("s125").value,
        },
      };
    case "normal":
    case "neutral":
      return paletteStep("s00");
  }
}

export function createSemanticSet(
  palette: string = "neutral",
  kind: PaletteKind = "normal",
) {
  const paletteStep = (step: string) => ({ value: `{${palette}.${step}}` });

  const solidAccentStep = kind === "neutral" ? "s125" : "s90";
  const solidAccent = {
    DEFAULT: paletteStep(solidAccentStep),
    hover: kind === "neutral" ? paletteStep("s120") : paletteStep("s100"),
    active: kind === "neutral" ? paletteStep("s120") : paletteStep("s100"),
    disabled: paletteStep("s60"),
  };

  return {
    bg: {
      min: {
        DEFAULT: paletteStep("a00"),
        hover: paletteStep("a05"),
        active: paletteStep("a10"),
        disabled: paletteStep("a00"),
      },
      surface: {
        DEFAULT: paletteStep("a10"),
        hover: paletteStep("a15"),
        active: paletteStep("a20"),
        disabled: paletteStep("a05"),
      },
      subtle: {
        DEFAULT: paletteStep("a30"),
        hover: paletteStep("a40"),
        active: paletteStep("a50"),
        disabled: paletteStep("a15"),
      },
      shaded: {
        DEFAULT: paletteStep("a50"),
        hover: paletteStep("a60"),
        active: paletteStep("a65"),
        disabled: paletteStep("a30"),
      },
      solid: solidAccent,
    },
    bgSolid: {
      min: {
        DEFAULT: paletteStep("s00"),
        hover: paletteStep("s05"),
        active: paletteStep("s10"),
        disabled: paletteStep("s00"),
      },
      surface: {
        DEFAULT: paletteStep("s10"),
        hover: paletteStep("s15"),
        active: paletteStep("s20"),
        disabled: paletteStep("s05"),
      },
      subtle: {
        DEFAULT: paletteStep("s30"),
        hover: paletteStep("s40"),
        active: paletteStep("s50"),
        disabled: paletteStep("s15"),
      },
      shaded: {
        DEFAULT: paletteStep("s50"),
        hover: paletteStep("s60"),
        active: paletteStep("s65"),
        disabled: paletteStep("s30"),
      },
      solid: solidAccent,
    },
    fg: {
      max: paletteStep("s125"),
      onSolid: fgOnSolid(kind, paletteStep),
      heading: paletteStep("s120"),
      body: {
        DEFAULT: paletteStep("s115"),
        hover: paletteStep("s120"),
        disabled: paletteStep("s90"),
      },
      muted: {
        DEFAULT: paletteStep("s100"),
        hover: paletteStep("s110"),
        disabled: paletteStep("s80"),
      },
      subtle: {
        DEFAULT: paletteStep("s90"),
        hover: paletteStep("s100"),
        disabled: paletteStep("s70"),
      },
      link: {
        DEFAULT: paletteStep("s110"),
        hover: paletteStep("s120"),
        active: paletteStep("s110"),
        disabled: paletteStep("s90"),
      },
    },
    bd: {
      subtle: {
        DEFAULT: paletteStep("a40"),
        hover: paletteStep("a50"),
        active: paletteStep("a50"),
        disabled: paletteStep("a20"),
      },
      solid: {
        DEFAULT: paletteStep("a60"),
        hover: paletteStep("a70"),
        active: paletteStep("a70"),
        disabled: paletteStep("a40"),
      },
      strong: {
        DEFAULT: paletteStep("a80"),
        hover: paletteStep("a90"),
        active: paletteStep("a90"),
        disabled: paletteStep("a60"),
      },
    },
  };
}
