import type { Meta, StoryObj } from "@storybook/react-vite";

import { Slider } from "./slider";

const meta = {
  title: "Component Library/Slider",
  component: Slider,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    min: {
      name: "Min",
      control: {
        type: "number",
      },
      description: "Minimum value for the slider",
    },
    max: {
      name: "Max",
      control: {
        type: "number",
      },
      description: "Maximum value for the slider",
    },
    defaultValue: {
      name: "Default Value",
      control: {
        type: "number",
      },
      description: "Initial value for the slider",
    },
    specularOpacity: {
      name: "Specular Opacity",
      control: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
      },
      description: "Controls the intensity of specular highlights",
    },
    specularSaturation: {
      name: "Specular Saturation",
      control: {
        type: "range",
        min: 0,
        max: 50,
        step: 1,
      },
      description: "Adjusts the color saturation of highlights",
    },
    blurLevel: {
      name: "Blur",
      control: {
        type: "range",
        min: 0,
        max: 40,
        step: 0.1,
      },
      description: "Adjusts the blur intensity of the backdrop filter",
    },
    label: {
      name: "Label",
      control: {
        type: "text",
      },
      description:
        "Label text to display above the slider. If not provided, no label is shown.",
    },
    showValueText: {
      name: "Show Value Text",
      control: {
        type: "boolean",
      },
      description: "Whether to show the current value as text above the slider",
    },
    onChange: {
      description: "Callback function called when the slider value changes",
    },
  },
  args: {
    min: 0,
    max: 100,
    defaultValue: 10,
    specularOpacity: 0.4,
    specularSaturation: 7,
    blurLevel: 0,
    label: "Volume",
    showValueText: true,
    onChange: (value: number[]) =>
      // eslint-disable-next-line no-console
      console.log("Value changed:", value),
  },
} satisfies Meta<typeof Slider>;

// eslint-disable-next-line import/no-default-export
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default Slider component with standard settings.
 * Try dragging the slider thumb to change values.
 * Use the Controls panel below to adjust visual parameters.
 */
export const Default: Story = {};

/**
 * Slider with only a label, no value text displayed.
 */
export const WithLabel: Story = {
  args: {
    label: "Brightness",
    showValueText: false,
    defaultValue: 75,
  },
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
};
