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

// eslint-disable-next-line import/no-default-export
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default Switch component with standard settings.
 * Try dragging the Switch thumb or clicking to switch states.
 * Use the Controls panel below to adjust visual parameters.
 */
export const Default: Story = {};

/**
 * Interactive demo showcasing the Switch component with enhanced effects.
 * This variant demonstrates higher visual impact settings.
 */
export const Enhanced: Story = {
  args: {
    specularOpacity: 0.8,
    specularSaturation: 25,
    blurLevel: 5,
  },
  parameters: {
    docs: {
      description: {
        story: `
This story demonstrates enhanced visual effects:

- **Higher Specular Opacity**: More intense highlights
- **Increased Saturation**: More vivid color effects  
- **Moderate Refraction**: Balanced glass-like appearance
- **Enhanced Blur**: More prominent backdrop filtering

Use the Controls panel to experiment with different parameter combinations.
        `,
      },
    },
  },
};

/**
 * Minimal visual effects for a cleaner, more subtle appearance.
 */
export const Minimal: Story = {
  args: {
    specularOpacity: 0.2,
    specularSaturation: 2,
    blurLevel: 0,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A subtle version with minimal visual effects for more conservative designs.",
      },
    },
  },
};
