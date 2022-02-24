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
    title?: React.CSSProperties;
    h1?: React.CSSProperties;
    h2?: React.CSSProperties;
    h3?: React.CSSProperties;
    h4?: React.CSSProperties;
    h5?: React.CSSProperties;
    mediumCaps?: React.CSSProperties;
    smallCaps?: React.CSSProperties;
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
    regularTextParagaphs: true;
    regularTextLabels: true;
    smallTextParagraphs: true;
    smallTextLabels: true;
    microText: true;
  }
}

// eslint-disable-next-line import/no-default-export  -- https://github.com/mui-org/material-ui/issues/28244
export default "";
