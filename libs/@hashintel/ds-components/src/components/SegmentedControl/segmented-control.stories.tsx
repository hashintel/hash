import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SegmentedControl } from "../segmented-control";

const meta: Meta<typeof SegmentedControl> = {
  title: "Components/SegmentedControl",
  component: SegmentedControl,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
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
