import type { Meta, StoryObj } from "@storybook/react";

import { BlockPromptInput } from "./block-prompt-input";

const meta = {
  title: "Block Design System/Block Prompt Input",
  component: BlockPromptInput,
  tags: ["docsPage"],
} satisfies Meta<typeof BlockPromptInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {
  args: {
    placeholder: "placeholder",
    buttonLabel: "submit",
  },
};
export const Error: Story = {
  args: {
    placeholder: "placeholder",
    buttonLabel: "submit",
    apiName: "Block",
    error: true,
  },
};
