import { Components } from "@mui/material";
import { CSSProperties } from "react";

declare module "@mui/material/styles" {
  interface ShadowSizes {
    none: string;
    xs: string;
    sm: string;
    md: string;
    mdReverse: string;
    lg: string;
    xl: string;
    xxl: string;
    purpleShadowMd: string;
  }

  interface Theme {
    borderRadii: {
      none: string;
      sm: string;
      md: string;
      lg: string;
    };
    boxShadows: ShadowSizes;
    dropShadows: ShadowSizes;
  }

  interface ThemeOptions {
    components: Components<Theme>;
    boxShadows: ShadowSizes;
    dropShadows: ShadowSizes;
    borderRadii: {
      none: string;
      sm: string;
      md: string;
      lg: string;
    };
  }

  interface PaletteValue {
    10: string;
    20: string;
    30: string;
    40: string;
    50: string;
    60: string;
    70: string;
    80: string;
    90: string;
    100: string;
  }
  interface Palette {
    gray: PaletteValue;
    grey: undefined;
    blue: PaletteValue;
    purple: PaletteValue;
    red: PaletteValue;
    orange: PaletteValue;
    green: PaletteValue;
    yellow: PaletteValue;
    pink: PaletteValue;
    teal: PaletteValue;
    mint: PaletteValue;
    turquoise: PaletteValue;
    navy: PaletteValue;
    white: string;
    black: string;
  }

  interface TypographyVariants {
    title: CSSProperties;
    h1: CSSProperties;
    h2: CSSProperties;
    h3: CSSProperties;
    h4: CSSProperties;
    h5: CSSProperties;
    mediumCaps: CSSProperties;
    smallCaps: CSSProperties;
    largeTextLabels: CSSProperties;
    regularTextPages: CSSProperties;
    regularTextParagraphs: CSSProperties;
    regularTextLabels: CSSProperties;
    smallTextParagraphs: CSSProperties;
    smallTextLabels: CSSProperties;
    microText: CSSProperties;
  }

  interface TypographyVariantsOptions {
    title?: CSSProperties;
    h1?: CSSProperties;
    h2?: CSSProperties;
    h3?: CSSProperties;
    h4?: CSSProperties;
    h5?: CSSProperties;
    mediumCaps?: CSSProperties;
    smallCaps?: CSSProperties;
    largeTextLabels?: CSSProperties;
    regularTextPages?: CSSProperties;
    regularTextParagraphs?: CSSProperties;
    regularTextLabels?: CSSProperties;
    smallTextParagraphs?: CSSProperties;
    smallTextLabels?: CSSProperties;
    microText?: CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    title: true;
    h1: true;
    h2: true;
    h3: true;
    h4: true;
    h5: true;
    mediumCaps: true;
    smallCaps: true;
    largeTextLabels: true;
    regularTextPages: true;
    regularTextParagraphs: true;
    regularTextLabels: true;
    smallTextParagraphs: true;
    smallTextLabels: true;
    microText: true;
    // disable unused defaults
    h6: false;
    subtitle1: false;
    subtitle2: false;
    body1: false;
    body2: false;
    caption: false;
    button: false;
    overline: false;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    primary: true;
    secondary: true;
    tertiary: true;
    tertiary_quiet: true;
    warning: true;
    danger: true;
    // Disable defaults
    contained: false;
    outlined: false;
    text: false;
  }

  interface ButtonPropsColorOverrides {
    purple: true;
    teal: true;
    warning: true;
    danger: true;
    gray: true;
    // Disable defaults
    primary: false;
    secondary: false;
    success: false;
    error: false;
    info: false;
    warning: false;
  }

  interface ButtonPropsSizeOverrides {
    large: true;
    medium: true;
    small: true;
    xs: true;
  }
}

declare module "@mui/material/IconButton" {
  interface IconButtonPropsSizeOverrides {
    large: true;
    medium: true;
    small: true;
    xs: true;
  }
}

declare module "@mui/lab/TreeItem" {
  interface TreeItemContentProps {
    expandable: boolean;
    url: string;
    depth: number;
  }
}

declare module "@mui/material/TextField" {
  interface TextFieldPropsSizeOverrides {
    xs: true;
    small: true;
    medium: true;
    large: true;
  }
}

declare module "@mui/material/InputBase" {
  interface InputBasePropsSizeOverrides {
    xs: true;
    small: true;
    medium: true;
    large: true;
  }
}

declare module "@mui/material/Chip" {
  interface ChipPropsSizeOverrides {
    xs: true;
    small: true;
    medium: true;
    large: true;
  }

  interface ChipPropsColorOverrides {
    gray: true;
    blue: true;
    purple: true;
    red: true;
    orange: true;
    green: true;
    yellow: true;
    pink: true;
    teal: true;
    mint: true;
    navy: true;
    turquoise: true;
    // Disable defaults
    default: false;
    primary: false;
    secondary: false;
    success: false;
    error: false;
    info: false;
    warning: false;
  }
}

 
export default "";
