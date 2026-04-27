import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";

import {
  SegmentedControl,
  type SegmentedControlProps,
} from "./segmented-control";

export default {
  title: "Components/SegmentedControl",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    defaultValue: {
      control: { type: "text" },
      description: "Default selected value",
    },
    disabled: {
      control: { type: "boolean" },
      description: "Whether the control is disabled",
    },
  },
  args: {
    defaultValue: "option1",
    disabled: false,
  },
} satisfies StoryDefault<SegmentedControlProps>;

/**
 * Interactive segmented control with glass-like visual effects.
 * This story demonstrates the complete functionality with state management
 * and shows how the optical properties create realistic lighting effects.
 */
export const Interactive: Story<SegmentedControlProps> = (args) => {
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
};
Interactive.parameters = {
  layout: "fullscreen",
};
