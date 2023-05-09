import type { Meta, StoryObj } from "@storybook/react";

import { GetHelpLink } from "./get-help-link";

const meta = {
  title: "Block Design System/Get Help Link",
  component: GetHelpLink,
  tags: ["docsPage"],
} satisfies Meta<typeof GetHelpLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {
  args: {
    href: "#",
  },
};
