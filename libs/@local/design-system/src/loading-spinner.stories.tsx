import type { Meta, StoryObj } from "@storybook/react";

import { LoadingSpinner } from "./loading-spinner";

const meta = {
  title: "Design System/Loading Spinner",
  component: LoadingSpinner,
  tags: ["docsPage"],
} satisfies Meta<typeof LoadingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {
  args: {},
};
