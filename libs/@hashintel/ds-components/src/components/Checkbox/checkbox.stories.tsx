import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Checkbox, type CheckboxProps } from "../checkbox";

const meta: Meta<CheckboxProps> = {
  title: "Components/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
# Checkbox Component

A simple checkbox component built with @ark-ui/react and styled with PandaCSS.

## States

- **Unchecked**: Default empty state
- **Checked**: Selected state with checkmark
- **Indeterminate**: Partial selection state with minus icon
- **Disabled**: Non-interactive state

## Interactions

- **Hover**: Slightly darker border and background
- **Focus**: Blue outline ring
- **Disabled**: Reduced opacity and muted colors
        `,
      },
    },
  },
  argTypes: {
    checked: {
      control: "radio",
      options: [false, true, "indeterminate"],
      description: "The checked state of the checkbox",
    },
    disabled: {
      control: "boolean",
      description: "Whether the checkbox is disabled",
    },
    invalid: {
      control: "boolean",
      description: "Whether the checkbox is in an invalid state",
    },
    readOnly: {
      control: "boolean",
      description: "Whether the checkbox is read-only",
    },
    required: {
      control: "boolean",
      description: "Whether the checkbox is required",
    },
    label: {
      control: "text",
      description: "Label text for the checkbox",
    },
    onCheckedChange: {
      action: "checked changed",
      description: "Callback when the checked state changes",
    },
  },
  args: {
    disabled: false,
    invalid: false,
    readOnly: false,
    required: false,
    label: "Label",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default checkbox in unchecked state
 */
export const Default: Story = {
  args: {
    checked: false,
  },
};

/**
 * Checkbox in checked state
 */
export const Checked: Story = {
  args: {
    checked: true,
  },
};

/**
 * Checkbox in indeterminate state (partial selection)
 */
export const Indeterminate: Story = {
  args: {
    checked: "indeterminate",
  },
};

/**
 * Disabled checkbox states
 */
export const Disabled: Story = {
  argTypes: {},
  parameters: {
    actions: { disable: true },
    interactions: { disable: true },
    controls: { disable: true },
  },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Enabled Row */}
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <Checkbox label="Unchecked" checked={false} />
        <Checkbox label="Checked" checked />
        <Checkbox label="Indeterminate" checked="indeterminate" />
      </div>
      {/* Disabled Row */}
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <Checkbox label="Unchecked" disabled checked={false} />
        <Checkbox label="Checked" disabled checked />
        <Checkbox label="Indeterminate" disabled checked="indeterminate" />
      </div>
    </div>
  ),
};

/**
 * Interactive checkbox with controlled state
 */
export const Interactive: Story = {
  argTypes: {},
  parameters: {
    actions: { disable: true },
    interactions: { disable: true },
    controls: { disable: true },
  },
  render: () => {
    const [checked, setChecked] = useState<boolean | "indeterminate">(false);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Checkbox
          label="Interactive Checkbox"
          checked={checked}
          onCheckedChange={setChecked}
        />

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setChecked(false)}
            style={{
              padding: "4px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
            }}
          >
            Uncheck
          </button>
          <button
            type="button"
            onClick={() => setChecked(true)}
            style={{
              padding: "4px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
            }}
          >
            Check
          </button>
          <button
            type="button"
            onClick={() => setChecked("indeterminate")}
            style={{
              padding: "4px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
            }}
          >
            Set Indeterminate
          </button>
        </div>
      </div>
    );
  },
};
