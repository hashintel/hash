import type { Meta, StoryObj } from "@storybook/react";

import { Toggle } from "./Toggle";

const meta = {
  title: "Component Library/Toggle",
  component: Toggle,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
A sophisticated toggle component with advanced visual effects including motion animations, 
blur effects, specular highlights, and refraction. Features smooth spring animations and 
interactive visual parameter controls.

## Features
- ✨ Smooth spring-based animations
- 🎨 Advanced visual effects (blur, specular highlights, refraction)
- 📱 Touch and mouse interaction support
- ⚙️ Real-time visual parameter adjustment
- 🎯 Accessible with proper ARIA labels
- 🌙 Dark mode support

## Usage
The Toggle component accepts props to control various visual parameters.
Use the Storybook controls panel to experiment with different settings.
        `,
      },
    },
  },
  argTypes: {
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
      description: "Forces the toggle to remain in an active state",
    },
  },
  args: {
    specularOpacity: 0.5,
    specularSaturation: 6,
    refractionLevel: 1,
    blurLevel: 0.2,
    forceActive: false,
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The default Toggle component with standard settings.
 * Try dragging the toggle thumb or clicking to switch states.
 * Use the Controls panel below to adjust visual parameters.
 */
export const Default: Story = {};

/**
 * Interactive demo showcasing the Toggle component with enhanced effects.
 * This variant demonstrates higher visual impact settings.
 */
export const Enhanced: Story = {
  args: {
    specularOpacity: 0.8,
    specularSaturation: 25,
    refractionLevel: 0.8,
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
    refractionLevel: 0.3,
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

/**
 * Forced active state for demonstrating the toggle's active appearance.
 */
export const ForceActive: Story = {
  args: {
    forceActive: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Shows the toggle in a permanently active state to demonstrate active styling and animations.",
      },
    },
  },
};
