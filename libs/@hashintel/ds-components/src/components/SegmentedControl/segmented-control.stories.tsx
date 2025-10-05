import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SegmentedControl } from "./segmented-control";

const meta: Meta<typeof SegmentedControl> = {
  title: "Component Library/SegmentedControl",
  component: SegmentedControl,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
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
    specularSaturation: 14,
  },

  render: (args) => {
    const [selectedValue, setSelectedValue] = useState(
      args.defaultValue ?? "option1",
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
          options={[
            { name: "Option 1", value: "option1" },
            { name: "Option 2", value: "option2" },
            { name: "Option 3", value: "option3" },
          ]}
          value={selectedValue}
          onValueChange={setSelectedValue}
        />
      </div>
    );
  },

  parameters: {
    layout: "fullscreen",
  },
};
