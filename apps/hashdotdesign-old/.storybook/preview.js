// import { CssBaseline, ThemeProvider } from "@mui/material";

// import { theme } from "../../../libs/@hashintel/design-system";

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

export const withMuiTheme = (Story) => (
  // <ThemeProvider theme={theme}>
  //   <CssBaseline />
  <Story />
  // </ThemeProvider>
);

export const decorators = [withMuiTheme];
