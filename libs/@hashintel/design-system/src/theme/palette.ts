import { PaletteValue, ThemeOptions } from "@mui/material";

type colorKeys =
  | "gray"
  | "blue"
  | "purple"
  | "red"
  | "orange"
  | "green"
  | "yellow"
  | "pink"
  | "teal"
  | "mint"
  | "copper"
  | "navy"
  | "black"
  | "white";

type CustomColorsType = {
  [P in colorKeys]: (string | PaletteValue) & {
    contrastText?: string;
    main?: string;
  };
};

export const customColors = {
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
    100: "#0E1114",
  },
  blue: {
    5: "#FAFFFF",
    10: "#F7FDFF",
    20: "#E0F4FF",
    30: "#B4E2FD",
    40: "#7ACAFA",
    50: "#48B3F4",
    60: "#199BEF",
    70: "#0775E3",
    80: "#006DC3",
    90: "#0059A5",
    100: "#03366C",
  },
  purple: {
    10: "#F7F8FF",
    20: "#EFEBFE",
    30: "#E4DDFD",
    40: "#C6B7FA",
    50: "#A690F4",
    60: "#8D68F8",
    70: "#7556DC",
    80: "#5532C3",
    90: "#4625AA",
    100: "#3A2084",
  },
  red: {
    10: "#FFF5F7",
    20: "#FFE2E2",
    30: "#FFC1C2",
    40: "#FF9EA7",
    50: "#F37174",
    60: "#EB5056",
    70: "#DF3449",
    80: "#CC1B3B",
    90: "#B20D2B",
    100: "#8D131B",
  },
  orange: {
    10: "#FFFAF5",
    20: "#FEECDC",
    30: "#FFDEBA",
    40: "#FFC180",
    50: "#FB9B56",
    60: "#E77632",
    70: "#CF5B23",
    80: "#BB4317",
    90: "#8C1E0A",
    100: "#601403",
  },
  green: {
    10: "#FAFDF0",
    20: "#F8FDD5",
    30: "#EEF8AB",
    40: "#DCEF87",
    50: "#BDE170",
    60: "#9AC952",
    70: "#78B040",
    80: "#42802C",
    90: "#334D0B",
    100: "#243804",
  },
  yellow: {
    10: "#FFFEF7",
    20: "#FFFAE5",
    30: "#FEF8D7",
    40: "#FDEEAF",
    50: "#FCE288",
    60: "#F8D462",
    70: "#F2BB36",
    80: "#E9A621",
    90: "#9E6306",
    100: "#754602",
  },
  pink: {
    10: "#FFFAFC",
    20: "#FEEDF3",
    30: "#FED1E3",
    40: "#FDB1D1",
    50: "#FB91C1",
    60: "#F15FA4",
    70: "#E84694",
    80: "#DA3285",
    90: "#A81761",
    100: "#850F4C",
  },
  teal: {
    10: "#F2FCFD",
    20: "#E7F9FB",
    30: "#D8F3F6",
    40: "#AADEE6",
    50: "#84CDDA",
    60: "#3DB9CF",
    70: "#05A2C2",
    80: "#0894B3",
    90: "#0C7792",
    100: "#04313C",
  },
  turquoise: {
    10: "#F2FAFD",
    20: "#DEF4FD",
    30: "#BFE7F9",
    40: "#96D7EC",
    50: "#56C4E7",
    60: "#23ABD6",
    70: "#0089B4",
    80: "#006282",
    90: "#004A62",
    100: "#00263C",
  },
  mint: {
    10: "#EFFEFA",
    20: "#E1FBF4",
    30: "#D2F7ED",
    40: "#C0EFE3",
    50: "#A5E4D4",
    60: "#7DD4C0",
    70: "#40C4AA",
    80: "#1AAE9A",
    90: "#147D6F",
    100: "#0D5349",
  },
  copper: {
    10: "#FCF9F6",
    20: "#F8F1EA",
    30: "#EFDDCC",
    40: "#E8CDB5",
    50: "#DDB896",
    60: "#D09E72",
    70: "#AD7F58",
    80: "#A07653",
    90: "#886349",
    100: "#3F2C22",
  },
  navy: {
    10: "#F5FAFF",
    20: "#D8E4F5",
    30: "#BCCFEB",
    40: "#8BA5D6",
    50: "#6480C2",
    60: "#4660AD",
    70: "#304799",
    80: "#203485",
    90: "#162670",
    100: "#0E1B5C",
  },
  black: "#0E1114",
  white: "#FFFFFF",
} as CustomColorsType;

// This adds `contrastText` and `main` to each palette field since MUI uses them internally
// in components like MuiChip. This prevents components like MuiChip from
// breaking even though we override the default styles of such components
for (const key of Object.keys(customColors)) {
  const color = key as keyof CustomColorsType;
  if (color in customColors && typeof customColors[color] !== "string") {
    customColors[color].contrastText = customColors[color][80];
    customColors[color].main = customColors[color][80];
  }
}

export const palette: ThemeOptions["palette"] = {
  divider: customColors.gray[30],
  primary: {
    dark: customColors.blue[90],
    main: customColors.blue[70],
    light: customColors.blue[50],
  },
  secondary: {
    dark: customColors.purple[90],
    main: customColors.purple[70],
    light: customColors.purple[50],
  },
  warning: {
    dark: customColors.orange[80],
    main: customColors.orange[60],
    light: customColors.orange[40],
  },
  error: {
    dark: customColors.red[90],
    main: customColors.red[70],
    light: customColors.red[50],
  },
  info: {
    dark: customColors.blue[90],
    main: customColors.blue[70],
    light: customColors.blue[50],
  },
  success: {
    dark: customColors.green[80],
    main: customColors.green[60],
    light: customColors.green[40],
  },
  text: {
    primary: customColors.gray[80],
    secondary: customColors.gray[70],
    disabled: customColors.gray[50],
  },
  common: {
    black: customColors.black as string,
    white: customColors.white as string,
  },
  ...customColors,
};
