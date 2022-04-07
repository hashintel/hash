declare module "@mui/material/styles" {
  interface Palette {
    white: string;
    black: string;
    purple: {
      600: string;
    };
    blue: {
      700: string;
    };
    yellow: {
      100: string;
      200: string;
      300: string;
      400: string;
      500: string;
      600: string;
      700: string;
      800: string;
      900: string;
      1000: string;
    };
    orange: {
      100: string;
      200: string;
      300: string;
      400: string;
      500: string;
      600: string;
      700: string;
      800: string;
      900: string;
    };
    red: {
      500: string;
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
    hashLargeTitle: React.CSSProperties;
    hashHeading1: React.CSSProperties;
    hashHeading2: React.CSSProperties;
    hashHeading4: React.CSSProperties;
    hashBodyCopy: React.CSSProperties;
    hashLargeText: React.CSSProperties;
    hashSmallText: React.CSSProperties;
    hashSmallTextMedium: React.CSSProperties;
    hashFooterHeading: React.CSSProperties;
    hashSmallCaps: React.CSSProperties;
    hashMediumCaps: React.CSSProperties;
    hashSocialIconLink?: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    hashLargeTitle?: React.CSSProperties;
    hashHeading1?: React.CSSProperties;
    hashHeading2?: React.CSSProperties;
    hashHeading4?: React.CSSProperties;
    hashBodyCopy?: React.CSSProperties;
    hashLargeText?: React.CSSProperties;
    hashSmallText?: React.CSSProperties;
    hashSmallTextMedium?: React.CSSProperties;
    hashFooterHeading?: React.CSSProperties;
    hashSmallCaps?: React.CSSProperties;
    hashMediumCaps?: React.CSSProperties;
    hashSocialIconLink?: React.CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    hashLargeTitle: true;
    hashHeading1: true;
    hashHeading2: true;
    hashHeading4: true;
    hashBodyCopy: true;
    hashLargeText: true;
    hashSmallText: true;
    hashSmallTextMedium: true;
    hashFooterHeading: true;
    hashSmallCaps: true;
    hashMediumCaps: true;
    hashSocialIconLink: true;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsVariantOverrides {
    primary: true;
    primarySquare: true;
    secondary: true;
    tertiary: true;
    // Disable defaults
    contained: false;
    outlined: false;
    text: false;
  }

  interface ButtonPropsColorOverrides {
    default: true;
    // Disable defaults
    primary: false;
    secondary: false;
    success: false;
    error: false;
    info: false;
    warning: false;
  }

  interface ButtonPropsSizeOverrides {
    small: false;
  }
}

declare module "@mui/material/Paper" {
  interface PaperPropsVariantOverrides {
    yellow: true;
  }
}

// https://github.com/mui-org/material-ui/issues/28244
export default "";
