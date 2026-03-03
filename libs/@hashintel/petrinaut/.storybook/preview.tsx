import "../src/index.css";

import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  decorators: [
    (Story) => {
      return (
        <div
          // Required (for now) given design tokens are scoped to .petrinaut-root
          className="petrinaut-root"
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
