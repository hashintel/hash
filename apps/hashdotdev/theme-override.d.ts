import { CSSProperties } from "react";

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
    hashLargeTitle: CSSProperties;
    hashHeading1: CSSProperties;
    hashHeading2: CSSProperties;
    hashHeading3: CSSProperties;
    hashHeading4: CSSProperties;
    hashHeading5: CSSProperties;
    hashBodyCopy: CSSProperties;
    hashLargeText: CSSProperties;
    hashSmallText: CSSProperties;
    hashSmallTextMedium: CSSProperties;
    hashFooterHeading: CSSProperties;
    hashSmallCaps: CSSProperties;
    hashMediumCaps: CSSProperties;
    hashSocialIconLink?: CSSProperties;
    hashCode?: CSSProperties;
  }

  interface TypographyVariantsOptions {
    hashLargeTitle?: CSSProperties;
    hashHeading1?: CSSProperties;
    hashHeading2?: CSSProperties;
    hashHeading3?: CSSProperties;
    hashHeading4?: CSSProperties;
    hashHeading5?: CSSProperties;
    hashBodyCopy?: CSSProperties;
    hashLargeText?: CSSProperties;
    hashSmallText?: CSSProperties;
    hashSmallTextMedium?: CSSProperties;
    hashFooterHeading?: CSSProperties;
    hashSmallCaps?: CSSProperties;
    hashMediumCaps?: CSSProperties;
    hashSocialIconLink?: CSSProperties;
    hashCode?: CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    hashLargeTitle: true;
    hashHeading1: true;
    hashHeading2: true;
    hashHeading3: true;
    hashHeading4: true;
    hashHeading5: true;
    hashBodyCopy: true;
    hashLargeText: true;
    hashSmallText: true;
    hashSmallTextMedium: true;
    hashFooterHeading: true;
    hashSmallCaps: true;
    hashMediumCaps: true;
    hashSocialIconLink: true;
    hashCode: true;
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
export {};
