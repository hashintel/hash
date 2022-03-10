/**
 * @todo update from blockprotocol
 */
declare module "@mui/material/styles" {
  interface Palette {
    purple: {
      100: string;
      200: string;
      300: string;
      400: string;
      500: string;
      600: string;
      700: string;
      800: string;
      subtle: string;
    };
    teal: {
      100: string;
      200: string;
      300: string;
      400: string;
      500: string;
      600: string;
      700: string;
    };
    orange: {
      100: string;
      200: string;
      300: string;
      400: string;
      500: string;
      600: string;
      700: string;
    };
    red: {
      100: string;
      200: string;
      300: string;
      400: string;
      500: string;
      600: string;
      700: string;
      800: string;
    };
    gray: {
      10: string;
      20: string;
      30: string;
      40: string;
      50: string;
      60: string;
      70: string;
      80: string;
      90: string;
    };
    grey: undefined;
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

// https://github.com/mui-org/material-ui/issues/28244
export default "";
