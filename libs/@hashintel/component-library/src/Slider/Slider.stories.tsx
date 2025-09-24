import type { Meta, StoryObj } from "@storybook/react-vite";

import { Slider } from "./slider";

const meta = {
  title: "Component Library/Slider",
  component: Slider,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
A sophisticated slider component with advanced visual effects including motion animations, 
blur effects, specular highlights, and refraction. Features smooth spring animations, 
drag interactions, and customizable visual parameters.

## Features
- ✨ Smooth spring-based animations
- 🎨 Advanced visual effects (blur, specular highlights, refraction)
- 🖱️ Drag and pointer interaction support
- ⚙️ Real-time visual parameter adjustment
- 🎯 Accessible with proper ARIA labels
- 🌙 Dark mode support
- 📊 Customizable min/max values and onChange callback

## Usage
The Slider component accepts props to control the range, value, visual parameters, and callbacks.
Use the Storybook controls panel to experiment with different settings.
        `,
      },
    },
  },
  argTypes: {
    min: {
      control: {
        type: "number",
      },
      description: "Minimum value for the slider",
    },
    max: {
      control: {
        type: "number",
      },
      description: "Maximum value for the slider",
    },
    defaultValue: {
      control: {
        type: "number",
      },
      description: "Initial value for the slider",
    },
    specularOpacity: {
      control: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
      },
      description: "Controls the intensity of specular highlights",
    },
    specularSaturation: {
      control: {
        type: "range",
        min: 0,
        max: 50,
        step: 1,
      },
      description: "Adjusts the color saturation of highlights",
    },
    refractionLevel: {
      control: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
      },
      description: "Controls the glass-like refraction effect",
    },
    blurLevel: {
      control: {
        type: "range",
        min: 0,
        max: 40,
        step: 0.1,
      },
      description: "Adjusts the blur intensity of the backdrop filter",
    },
    forceActive: {
      control: "boolean",
      description: "Forces the slider to remain in an active state",
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
    refractionLevel: 1,
    blurLevel: 0,
    forceActive: false,
    onChange: (value: number) => console.log("Value changed:", value),
  },
} satisfies Meta<typeof Slider>;

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
    refractionLevel: 0.8,
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
    refractionLevel: 0.2,
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
 * Custom range demonstrating different min/max values.
 */
export const CustomRange: Story = {
  args: {
    min: -50,
    max: 200,
    defaultValue: 75,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates a slider with custom range from -50 to 200, starting at 75.",
      },
    },
  },
};

/**
 * Forced active state for demonstrating the slider's active appearance.
 */
export const ForceActive: Story = {
  args: {
    forceActive: true,
    defaultValue: 60,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows the slider in a permanently active state to demonstrate active styling and animations.",
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
    onChange: (value: number) => {
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
