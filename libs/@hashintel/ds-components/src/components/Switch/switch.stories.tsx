import type { Meta, StoryObj } from "@storybook/react-vite";

import { Switch } from "../switch";

const meta = {
  title: "Components/Switch",
  component: Switch,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default Switch component with standard settings.
 * Try dragging the Switch thumb or clicking to switch states.
 * Use the Controls panel below to adjust visual parameters.
 */
export const Default: Story = {};
