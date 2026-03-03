import "../src/index.css";

import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const isComponent = context.title.startsWith("Components");

      return (
        <div
          className="petrinaut-root"
          // This is a workaround to prevent the background color from being applied to the components.
          // The goal is to provide components with everything .petrinaut-root has, without the background color.
          // Should be reworked to not rely on .petrinaut-root, and get design tokens differently.
          style={isComponent ? { backgroundColor: "transparent" } : undefined}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
