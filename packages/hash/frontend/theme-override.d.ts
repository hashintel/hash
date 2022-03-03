declare module "@mui/material/styles" {
  interface ShadowSizes {
    none: string;
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  }
  interface BaseTheme {
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
    gradient: string;
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
  }

  interface TypographyVariants {
    title: React.CSSProperties;
    h1: React.CSSProperties;
    h2: React.CSSProperties;
    h3: React.CSSProperties;
    h4: React.CSSProperties;
    h5: React.CSSProperties;
    mediumCaps: React.CSSProperties;
    smallCaps: React.CSSProperties;
    largeTextLabels: React.CSSProperties;
    regularTextParagraphs: React.CSSProperties;
    regularTextLabels: React.CSSProperties;
    smallTextParagraphs: React.CSSProperties;
    smallTextLabels: React.CSSProperties;
    microText: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    title?: React.CSSProperties;
    h1?: React.CSSProperties;
    h2?: React.CSSProperties;
    h3?: React.CSSProperties;
    h4?: React.CSSProperties;
    h5?: React.CSSProperties;
    mediumCaps?: React.CSSProperties;
    smallCaps?: React.CSSProperties;
    largeTextLabels?: React.CSSProperties;
    regularTextParagraphs?: React.CSSProperties;
    regularTextLabels?: React.CSSProperties;
    smallTextParagraphs?: React.CSSProperties;
    smallTextLabels?: React.CSSProperties;
    microText?: React.CSSProperties;
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
    regularTextParagaphs: true;
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
    transparent: true;
    primary: true;
    secondary: true;
    tertiary: true;
    tertiary_quiet: true;
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

  interface ButtonPropsSizeOverrides {}
}

// eslint-disable-next-line import/no-default-export -- @see https://github.com/mui-org/material-ui/issues/28244
export default "";
