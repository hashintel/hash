import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { RadioGroup, type RadioGroupProps } from "./radio-group";

const meta: Meta<RadioGroupProps> = {
  title: "Components/RadioGroup",
  component: RadioGroup,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
# RadioGroup Component

A radio group component built with @ark-ui/react and styled with PandaCSS.
Supports both default and card variants.

## Variants

- **Default**: Simple radio buttons with labels
- **Card**: Full card layout with optional icons and descriptions

## States

- **Selected**: Currently selected option
- **Unselected**: Available options
- **Disabled**: Non-interactive state
- **Hover**: Visual feedback on interaction

## Interactions

- **Click**: Select an option
- **Keyboard**: Arrow keys to navigate, Space/Enter to select
- **Disabled**: No interaction possible
        `,
      },
    },
  },
  argTypes: {
    variant: {
      control: "radio",
      options: ["default", "card"],
      description: "Visual style variant",
    },
    disabled: {
      control: "boolean",
      description: "Whether the radio group is disabled",
    },
  },
  args: {
    variant: "default",
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<RadioGroupProps>;

export const Default: Story = {
  args: {
    variant: "default",
    options: [
      { value: "react", label: "React" },
      { value: "vue", label: "Vue" },
      { value: "svelte", label: "Svelte" },
      { value: "solid", label: "Solid" },
    ],
    defaultValue: "react",
  },
};

export const Card: Story = {
  args: {
    variant: "card",
    options: [
      {
        value: "basic",
        label: "Basic",
        description: "For simple applications",
        icon: (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="16" height="16" rx="2" fill="currentColor" />
          </svg>
        ),
      },
      {
        value: "pro",
        label: "Pro",
        description: "For professional use",
        icon: (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="8" cy="8" r="8" fill="currentColor" />
          </svg>
        ),
      },
      {
        value: "enterprise",
        label: "Enterprise",
        description: "For large organizations",
        icon: (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M8 0L16 8L8 16L0 8L8 0Z" fill="currentColor" />
          </svg>
        ),
      },
    ],
    defaultValue: "basic",
  },
};

export const Disabled: Story = {
  args: {
    variant: "default",
    options: [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2" },
      { value: "option3", label: "Option 3" },
    ],
    disabled: true,
    defaultValue: "option1",
  },
};

export const DisabledOption: Story = {
  args: {
    variant: "default",
    options: [
      { value: "option1", label: "Option 1" },
      { value: "option2", label: "Option 2 (Disabled)", disabled: true },
      { value: "option3", label: "Option 3" },
    ],
    defaultValue: "option1",
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [value, setValue] = useState("react");

    return (
      <div>
        <RadioGroup
          {...args}
          value={value}
          onValueChange={(newValue) => setValue(newValue)}
        />
        <p style={{ marginTop: "1rem", fontSize: "14px", color: "#737373" }}>
          Selected: {value}
        </p>
      </div>
    );
  },
  args: {
    variant: "default",
    options: [
      { value: "react", label: "React" },
      { value: "vue", label: "Vue" },
      { value: "svelte", label: "Svelte" },
      { value: "solid", label: "Solid" },
    ],
  },
};

export const CardWithManyOptions: Story = {
  args: {
    variant: "card",
    options: [
      {
        value: "starter",
        label: "Starter",
        description: "Perfect for individuals",
      },
      {
        value: "pro",
        label: "Professional",
        description: "For growing teams",
      },
      {
        value: "business",
        label: "Business",
        description: "For larger organizations",
      },
      {
        value: "enterprise",
        label: "Enterprise",
        description: "Custom solutions",
      },
    ],
    defaultValue: "pro",
  },
};
