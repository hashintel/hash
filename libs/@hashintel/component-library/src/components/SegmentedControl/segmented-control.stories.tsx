import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SegmentedControl } from "./segmented-control";

const meta: Meta<typeof SegmentedControl> = {
  title: "Component Library/SegmentedControl",
  component: SegmentedControl,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
A sophisticated segmented control component with advanced visual effects including blur, 
specular highlights, and refraction. Built on top of Ark UI's SegmentGroup, this component 
provides a glass-like appearance with customizable optical properties.

## Features
- 🎨 Advanced visual effects (blur, specular highlights, refraction)
- 📏 Customizable dimensions and radius
- ⚙️ Configurable visual parameters
- 🌟 Glass-like appearance with realistic lighting
- 🔧 Flexible scale ratio for dynamic effects
- 🖼️ Adjustable bezel width for frame customization
- 🔍 Variable glass thickness for refraction depth control
- ⚗️ Configurable refractive index for different material simulation
- 🎛️ Built on Ark UI for accessibility and interaction

## Usage
The SegmentedControl component accepts props to control its appearance and behavior.
Use the Storybook controls panel to experiment with different optical settings and see
how each parameter affects the final glass-like appearance.
        `,
      },
    },
  },
  argTypes: {
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
    bezelWidth: {
      control: {
        type: "range",
        min: 1,
        max: 50,
        step: 1,
      },
      description: "Width of the bezel frame around the glass element",
    },
    glassThickness: {
      control: {
        type: "range",
        min: 20,
        max: 200,
        step: 5,
      },
      description: "Thickness of the glass material affecting refraction depth",
    },
    refractiveIndex: {
      control: {
        type: "range",
        min: 1.0,
        max: 2.5,
        step: 0.01,
      },
      description:
        "Refractive index of the glass material (1.0 = air, 1.5 = typical glass)",
    },
    defaultValue: {
      control: "text",
      description: "Default selected value",
    },
    disabled: {
      control: "boolean",
      description: "Whether the control is disabled",
    },
  },
  args: {
    radius: 8,
    blur: 2,
    specularOpacity: 0.4,
    specularSaturation: 7,
    scaleRatio: 1,
    bezelWidth: 2,
    glassThickness: 16,
    refractiveIndex: 1.5,
    defaultValue: "option1",
    disabled: false,
  },
};

// eslint-disable-next-line import/no-default-export
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Interactive segmented control with glass-like visual effects.
 * This story demonstrates the complete functionality with state management
 * and shows how the optical properties create realistic lighting effects.
 */
export const Interactive: Story = {
  args: {
    radius: 22,
    blur: 1.7,
    specularOpacity: 0.64,
    bezelWidth: 11,
    glassThickness: 20,
    specularSaturation: 14
  },

  render: (args) => {
    const [selectedValue, setSelectedValue] = useState(
      args.defaultValue ?? "option1"
    );

    return (
      <div
        style={{
          padding: "4rem",
          height: "100vh",
          minHeight: "400px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2rem",
          backgroundImage:
            "url(https://images.unsplash.com/photo-1604871000636-074fa5117945?q=80&w=1587&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)",
        }}
      >
        <SegmentedControl
          {...args}
          value={selectedValue}
          onValueChange={setSelectedValue}
        />
      </div>
    );
  },

  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story: `
This interactive story showcases the SegmentedControl component with full state management.
The component demonstrates:

**Key Features:**
- **Glass-like Visual Effects**: Advanced optical properties create realistic material appearance
- **Interactive Selection**: Click segments to see selection state changes
- **Customizable Appearance**: All optical parameters can be adjusted via controls
- **Real-time Feedback**: Selected value is displayed below the component
- **Responsive Design**: Component adapts to different visual settings

**Optical Properties:**
- **Blur**: Controls the backdrop blur intensity
- **Specular Effects**: Adjusts highlight intensity and color saturation  
- **Refraction**: Scale ratio and refractive index for glass-like distortion
- **Bezel & Thickness**: Frame width and glass depth for dimensional effects

Use the controls panel to experiment with different optical settings and see how
they transform the component's appearance from subtle glass to bold crystal effects.
        `,
      },
    },
  }
};
