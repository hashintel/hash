import { Slider, type SliderProps } from "./slider";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Legacy/Slider",
  component: Slider,
  args: {
    min: 0,
    max: 100,
    defaultValue: 10,
    label: "Volume",
    showValueText: true,
  },
} satisfies Meta<SliderProps>;

export default meta;

type Story = StoryObj<SliderProps>;

/**
 * The default Slider component with standard settings.
 * Try dragging the slider thumb to change values.
 * Use the Controls panel below to adjust visual parameters.
 */
export const Default: Story = {
  render: (args) => <Slider {...args} style={{ width: "400px" }} />,
};

/**
 * Slider with only a label, no value text displayed.
 */
export const WithLabel: Story = {
  args: {
    label: "Brightness",
    showValueText: false,
    defaultValue: 75,
  },
  render: (args) => <Slider {...args} style={{ width: "400px" }} />,
};

/**
 * Slider with only value text, no label displayed.
 */
export const WithValueText: Story = {
  args: {
    label: undefined,
    showValueText: true,
    defaultValue: 50,
  },
  render: (args) => <Slider {...args} style={{ width: "400px" }} />,
};

/**
 * Slider with both label and value text.
 */
export const WithLabelAndValue: Story = {
  args: {
    label: "Temperature",
    showValueText: true,
    defaultValue: 72,
    min: 32,
    max: 100,
  },
  render: (args) => <Slider {...args} style={{ width: "400px" }} />,
};

/**
 * Minimal slider with no label or value text.
 */
export const Minimal: Story = {
  args: {
    label: undefined,
    showValueText: false,
    defaultValue: 25,
  },
  render: (args) => <Slider {...args} style={{ width: "400px" }} />,
};
