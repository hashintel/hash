import "@fontsource-variable/geist-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";

import "./index.css";

import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
