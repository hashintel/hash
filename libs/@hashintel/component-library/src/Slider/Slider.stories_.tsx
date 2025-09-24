import type { Meta, StoryObj } from "@storybook/react-vite";

import { Slider } from "./Slider_";

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
 * Interactive demo showcasing the Slider component with enhanced effects.
 * This variant demonstrates higher visual impact settings.
 */
export const Enhanced: Story = {
  args: {
    specularOpacity: 0.8,
    specularSaturation: 25,
    blurLevel: 5,
    defaultValue: 75,
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
- **Higher Default Value**: Shows filled progress bar

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
    specularOpacity: 0.1,
    specularSaturation: 1,
    blurLevel: 0,
    defaultValue: 50,
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

/**
 * Demonstrates the onChange callback functionality.
 */
export const WithCallback: Story = {
  args: {
    defaultValue: 25,
    onChange: (value: number[]) => {
      // eslint-disable-next-line no-console
      console.log("Slider value changed to:", value);
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Check the browser console to see the onChange callback in action as you drag the slider.",
      },
    },
  },
};
