export type StyleObject = {
  colors: {
    // from https://mui.com/material-ui/customization/palette/
    primary: {
      light: string;
      main: string;
      dark: string;
    };
    secondary: {
      light: string;
      main: string;
      dark: string;
    };
    error: {
      light: string;
      main: string;
      dark: string;
    };
    warning: {
      light: string;
      main: string;
      dark: string;
    };
    info: {
      light: string;
      main: string;
      dark: string;
    };
    success: {
      light: string;
      main: string;
      dark: string;
    };
    // from https://primer.style/design/foundations/color
    background: {
      main: string;
      inset: string;
      subtle: string;
      emphasis: string;
    };
    foreground: {
      main: string;
      muted: string;
      subtle: string;
      onEmphasis: string;
    };
    border: {
      main: string;
      muted: string;
    };
  };
};

export const CustomTheme: Partial<StyleObject> = {
  colors: {
    primary: {
      main: "#0366d6",
      dark: "#005cc5",
      light: "#58a6ff",
    },
  },
};
