import type { Meta, StoryObj } from "@storybook/react";

import { Bar } from "./Bar";

const meta = {
  title: "Component Library/Bar",
  component: Bar,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
A sophisticated bar component with advanced visual effects including blur, 
specular highlights, and refraction. This component serves as a building block 
for creating glass-like UI elements with customizable dimensions and visual properties.

## Features
- 🎨 Advanced visual effects (blur, specular highlights, refraction)
- 📏 Customizable dimensions (width, height, radius)
- ⚙️ Configurable visual parameters
- 🌟 Glass-like appearance with realistic lighting
- 🔧 Flexible scale ratio for dynamic effects

## Usage
The Bar component accepts props to control its dimensions and visual appearance.
Use the Storybook controls panel to experiment with different settings and see
how each parameter affects the final appearance.
        `,
      },
    },
  },
  argTypes: {
    width: {
      control: {
        type: "range",
        min: 50,
        max: 500,
        step: 10,
      },
      description: "Width of the bar element in pixels",
    },
    height: {
      control: {
        type: "range",
        min: 20,
        max: 200,
        step: 5,
      },
      description: "Height of the bar element in pixels",
    },
    radius: {
      control: {
        type: "range",
        min: 0,
        max: 50,
        step: 1,
      },
      description: "Border radius for rounded corners",
    },
    blur: {
      control: {
        type: "range",
        min: 0,
        max: 40,
        step: 0.1,
      },
      description: "Blur intensity for the backdrop filter effect",
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
    scaleRatio: {
      control: {
        type: "range",
        min: 0,
        max: 2,
        step: 0.1,
      },
      description: "Scale ratio for the refraction effect",
    },
  },
  args: {
    width: 200,
    height: 60,
    radius: 15,
    blur: 5,
    specularOpacity: 0.5,
    specularSaturation: 10,
    scaleRatio: 0.8,
  },
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The default Bar component with standard settings.
 * This demonstrates the basic glass-like appearance of the bar.
 */
export const Default: Story = {};

/**
 * A wider bar demonstrating how the component scales horizontally.
 */
export const Wide: Story = {
  args: {
    width: 400,
    height: 60,
    radius: 20,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A wider variant showing how the Bar component adapts to different widths while maintaining its visual quality.",
      },
    },
  },
};

/**
 * A tall bar demonstrating vertical scaling capabilities.
 */
export const Tall: Story = {
  args: {
    width: 150,
    height: 120,
    radius: 25,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A taller variant demonstrating how the component works with different height proportions.",
      },
    },
  },
};

/**
 * Sharp rectangular bar with minimal rounded corners.
 */
export const Rectangular: Story = {
  args: {
    width: 300,
    height: 40,
    radius: 2,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A more rectangular appearance with minimal border radius for modern, sharp designs.",
      },
    },
  },
};

/**
 * Highly rounded bar approaching a pill shape.
 */
export const Pill: Story = {
  args: {
    width: 250,
    height: 50,
    radius: 25,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A pill-shaped variant with high border radius for a softer, more organic appearance.",
      },
    },
  },
};

/**
 * Enhanced visual effects with higher blur and specular settings.
 */
export const Enhanced: Story = {
  args: {
    width: 250,
    height: 80,
    radius: 20,
    blur: 15,
    specularOpacity: 0.8,
    specularSaturation: 25,
    scaleRatio: 1.2,
  },
  parameters: {
    docs: {
      description: {
        story: `
Enhanced visual effects demonstrating:
- **Higher Blur**: More prominent backdrop filtering
- **Increased Specular Opacity**: More intense highlights
- **Higher Saturation**: More vivid color effects
- **Larger Scale Ratio**: More pronounced refraction effect
        `,
      },
    },
  },
};

/**
 * Minimal visual effects for a subtle, clean appearance.
 */
export const Minimal: Story = {
  args: {
    width: 200,
    height: 60,
    radius: 10,
    blur: 0,
    specularOpacity: 0.2,
    specularSaturation: 2,
    scaleRatio: 0.3,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A subtle version with minimal visual effects for more conservative or minimalist designs.",
      },
    },
  },
};

/**
 * Small compact bar for tight layouts or accent elements.
 */
export const Small: Story = {
  args: {
    width: 100,
    height: 30,
    radius: 8,
    blur: 3,
    specularOpacity: 0.4,
    specularSaturation: 8,
    scaleRatio: 0.6,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A compact version suitable for smaller UI elements, buttons, or accent pieces.",
      },
    },
  },
};

/**
 * Large prominent bar for hero sections or main elements.
 */
export const Large: Story = {
  args: {
    width: 400,
    height: 100,
    radius: 30,
    blur: 8,
    specularOpacity: 0.6,
    specularSaturation: 15,
    scaleRatio: 1.0,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A large, prominent variant suitable for hero sections, main call-to-action elements, or feature highlights.",
      },
    },
  },
};
