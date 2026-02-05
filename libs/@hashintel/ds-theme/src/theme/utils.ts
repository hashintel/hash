import { defineSemanticTokens } from "@pandacss/dev";

export function createSemanticSet(palette: "colors.neutral" | "colorPalette") {
  // palette step shortcut
  const ps = (step: string) => ({ value: `{${palette}.${step}}` });

  return defineSemanticTokens.colors({
    bg: {
      solid: {
        DEFAULT: ps("9"),
        hover: ps("10"),
        active: ps("10"),
        disabled: ps("6"),
      },
      surface: {
        DEFAULT: ps("a2"),
        hover: ps("a3"),
        active: ps("a4"),
        disabled: ps("a2"),
      },
      muted: {
        DEFAULT: ps("3"),
        hover: ps("4"),
        active: ps("5"),
        disabled: ps("2"),
      },
      subtle: {
        DEFAULT: ps("a3"),
        hover: ps("a4"),
        active: ps("a5"),
        disabled: ps("a2"),
      },
    },
    fg: {
      solid: { DEFAULT: { value: { _light: "white", _dark: "white" } } },
      DEFAULT: ps("12"),
      muted: {
        DEFAULT: ps("11"),
        hover: ps("12"),
        disabled: ps("9"),
      },
      subtle: {
        DEFAULT: ps("10"),
        hover: ps("11"),
        disabled: ps("8"),
      },
      link: {
        DEFAULT: ps("11"),
        hover: ps("12"),
        active: ps("11"),
        disabled: ps("9"),
      },
    },
    bd: {
      solid: {
        DEFAULT: ps("7"),
        hover: ps("8"),
        active: ps("8"),
        disabled: ps("5"),
      },
      subtle: {
        DEFAULT: ps("6"),
        hover: ps("7"),
        active: ps("7"),
        disabled: ps("4"),
      },
      muted: {
        DEFAULT: ps("a6"),
        hover: ps("a7"),
        active: ps("a7"),
        disabled: ps("a4"),
      },
    },
  });
}
