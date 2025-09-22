import type { Meta, StoryObj } from "@storybook/react-webpack5";

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
