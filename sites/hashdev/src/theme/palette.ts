import { ThemeOptions } from "@mui/material";

export const customColors = {
  yellow: {
    100: "#FFF8F0",
    200: "#FFF3E5",
    300: "#FFEAC2",
    400: "#FFE0BF",
    500: "#FFC180",
    600: "#F8D462",
    700: "#FBA759",
    800: "#E36C29",
    900: "#BB4317",
    1000: "#9C310A",
  },
  orange: {
    100: "#FFFAF5",
    200: "#FEECDC",
    300: "#FFDEBA",
    400: "#FFC180",
    500: "#FB9B56",
    600: "#E77632",
    700: "#CF5B23",
    800: "#BB4317",
    900: "#8C1E0A",
  },
  purple: {
    600: "#7A4FF5",
  },
  blue: {
    700: "#0775E3",
  },
  red: {
    500: "#E04D82",
  },
  // @todo should adjust to be consistent with the ones above
  gray: {
    10: "#F7FAFC",
    20: "#EBF2F7",
    30: "#DDE7F0",
    40: "#C1CFDE",
    50: "#91A5BA",
    60: "#758AA1",
    70: "#64778C",
    80: "#4D5C6C",
    90: "#37434F",
  },
  grey: undefined,
  black: "#0E1114",
  white: "#FFFFFF",
} as const;

export const palette: ThemeOptions["palette"] = {
  ...customColors,
  // @todo figure out how not to need this – Avatar
  grey: customColors.gray,
  primary: {
    main: customColors.yellow[300],
  },
  secondary: {
    main: customColors.purple[600],
  },
};
