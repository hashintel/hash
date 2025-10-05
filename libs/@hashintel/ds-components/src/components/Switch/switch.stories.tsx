import type { Meta, StoryObj } from "@storybook/react-vite";

import { Switch } from "./switch";

const meta = {
  title: "Component Library/Switch",
  component: Switch,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
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
  },
  args: {
    specularOpacity: 0.5,
    specularSaturation: 6,
    blurLevel: 0.2,
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
