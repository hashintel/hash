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
  decorators: [
    (Story) => (
      <div
        style={{
          padding: "40px",
          borderRadius: "12px",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          position: "relative",
          overflow: "hidden",
          backgroundImage: `
            linear-gradient(to right, rgba(128,128,128,0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(128,128,128,0.3) 1px, transparent 1px),
          `,
          backgroundSize: "15px 15px, 15px 15px, 100% 100%, 100% 100%",
          backgroundPosition: "0 0, 0 0, 0 0, 0 0",
        }}
      >
        {/* Background texture */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: "none",
          }}
        />
        <Story />
      </div>
    ),
  ],
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

/**
 * Bar displayed on a dark background to showcase contrast.
 */
export const OnDarkBackground: Story = {
  args: {
    width: 250,
    height: 70,
    radius: 18,
    blur: 8,
    specularOpacity: 0.7,
    specularSaturation: 20,
    scaleRatio: 1.1,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          padding: "40px",
          borderRadius: "12px",
          background:
            "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `
              radial-gradient(circle at 30% 20%, rgba(255,255,255,0.03) 0%, transparent 50%),
              radial-gradient(circle at 70% 80%, rgba(255,255,255,0.02) 0%, transparent 50%)
            `,
            pointerEvents: "none",
          }}
        />
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Demonstrates how the Bar component appears on dark backgrounds with enhanced specular effects.",
      },
    },
  },
};

/**
 * Bar on a textured background showing the glass effect more prominently.
 */
export const OnTexturedBackground: Story = {
  args: {
    width: 300,
    height: 60,
    radius: 15,
    blur: 12,
    specularOpacity: 0.6,
    specularSaturation: 15,
    scaleRatio: 0.9,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          padding: "40px",
          borderRadius: "12px",
          background: `
            linear-gradient(45deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='4'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
          `,
          backgroundBlendMode: "overlay",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Shows the Bar on a textured background to highlight the glass-like blur and refraction effects.",
      },
    },
  },
};

/**
 * Minimal background to focus on the component itself.
 */
export const OnMinimalBackground: Story = {
  args: {
    width: 200,
    height: 50,
    radius: 12,
    blur: 3,
    specularOpacity: 0.4,
    specularSaturation: 8,
    scaleRatio: 0.7,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          padding: "40px",
          borderRadius: "8px",
          background: "#f8f9fa",
          border: "1px solid #e9ecef",
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          "Clean, minimal background to focus attention on the component's intrinsic visual qualities.",
      },
    },
  },
};
