import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { BlockErrorMessage } from "./block-error-message";

const meta = {
  title: "Block Design System/Block Error Message",
  component: BlockErrorMessage,
  tags: ["docsPage"],
} satisfies Meta<typeof BlockErrorMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {
  args: {
    apiName: "",
  },
};
