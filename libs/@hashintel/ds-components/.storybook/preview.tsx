import "@fontsource-variable/geist-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "./preview.css";
import type { Decorator, Preview } from "@storybook/react-vite";

/**
 * Applies the selected color scheme the same way the app shell does: a
 * `light`/`dark` class on the root element drives the Panda theme conditions,
 * and `auto` leaves it to the system preference via CSS media queries.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals["theme"] as string;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme === "light" || theme === "dark") {
    root.classList.add(theme);
  }
  return <Story />;
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Color scheme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "auto", title: "System" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  parameters: {
    layout: "fullscreen",
    options: {
      storySort: {
        order: ["Primitives", "Tokens", "Legacy", "*"],
      },
    },
  },
};

export default preview;
