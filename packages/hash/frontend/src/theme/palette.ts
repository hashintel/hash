import { ThemeOptions } from "@mui/material";

export const customColors = {
  purple: {
    100: "#F4F3FF",
    200: "#D9D6FE",
    300: "#BDB4FE",
    400: "#AD9EFF",
    500: "#9B8AFB",
    600: "#6F59EC",
    700: "#6048E5",
    800: "#4732BA",
    subtle: "#C3CAE7",
  },
  teal: {
    100: "#F0F9FF",
    200: "#D8F1F8",
    300: "#9ED9E9",
    400: "#24BDE0",
    500: "#0A9FC0",
    600: "#0081A1",
    700: "#00586E",
  },
  orange: {
    100: "#FFF6ED",
    200: "#FDDCAB",
    300: "#FEB273",
    400: "#F58C4B",
    500: "#ED6F28",
    600: "#C74E0B",
    700: "#8F2F14",
  },
  red: {
    100: "#FCF3F6",
    200: "#F4C2D4",
    300: "#EE9BB9",
    400: "#E7749D",
    500: "#E04D82",
    600: "#D92666",
    700: "#AE1E52",
    800: "#82173D",
  },
  // should adjust to be consistent with the ones above
  gray: {
    10: "#FAFBFC",
    20: "#F2F5FA",
    30: "#D8DFE5",
    40: "#C5D1DB",
    50: "#9EACBA",
    60: "#64778C",
    70: "#4D5C6C",
    80: "#37434F",
  },
  grey: undefined,
  black: "#0E1114",
  white: "#FFFFFF",
} as const;

export const palette: ThemeOptions["palette"] = {
  ...customColors,
  primary: {
    main: customColors.purple[600],
  },
};
