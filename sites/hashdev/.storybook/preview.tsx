import "../styles/globals.css";
import { theme } from "../src/theme";
import { MuiProvider } from "../src/theme/MuiProvider";

export const decorators = [
  (Story: any) => (
    <MuiProvider theme={theme}>
      <Story />
    </MuiProvider>
  ),
];

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};
