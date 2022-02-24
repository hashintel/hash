declare module "@mui/material/styles" {
  type PaletteValue = {
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
  };
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
    bpTitle: React.CSSProperties;
    bpSubtitle: React.CSSProperties;
    bpHeading1: React.CSSProperties;
    bpHeading2: React.CSSProperties;
    bpHeading3: React.CSSProperties;
    bpHeading4: React.CSSProperties;
    bpLargeText: React.CSSProperties;
    bpBodyCopy: React.CSSProperties;
    bpSmallCopy: React.CSSProperties;
    bpMicroCopy: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    bpTitle?: React.CSSProperties;
    bpSubtitle?: React.CSSProperties;
    bpHeading1?: React.CSSProperties;
    bpHeading2?: React.CSSProperties;
    bpHeading3?: React.CSSProperties;
    bpHeading4?: React.CSSProperties;
    bpSmallCaps?: React.CSSProperties;
    bpLargeText?: React.CSSProperties;
    bpBodyCopy?: React.CSSProperties;
    bpSmallCopy?: React.CSSProperties;
    bpMicroCopy?: React.CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    bpTitle: true;
    bpSubtitle: true;
    bpHeading1: true;
    bpHeading2: true;
    bpHeading3: true;
    bpHeading4: true;
    bpSmallCaps: true;
    bpLargeText: true;
    bpBodyCopy: true;
    bpSmallCopy: true;
    bpMicroCopy: true;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    transparent: true;
    primary: true;
    secondary: true;
    tertiary: true;
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

declare module "@mui/material/Paper" {
  interface PaperPropsVariantOverrides {
    teal: true;
    purple: true;
  }
}

// eslint-disable-next-line import/no-default-export -- @see https://github.com/mui-org/material-ui/issues/28244
export default "";
