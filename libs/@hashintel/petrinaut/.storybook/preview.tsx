import "../src/index.css";

import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="petrinaut-root">
        <Story />
      </div>
    ),
  ],
};

export default preview;
