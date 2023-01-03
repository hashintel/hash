import type { Meta, StoryObj } from "@storybook/react";

import { Chip } from "./chip";

const meta = {
  title: "Design System/Chip",
  component: Chip,
  tags: ["docsPage"],
  args: {
    label: "Example Chip",
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {
  args: {},
};
