import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Checkbox, type CheckboxProps } from "./checkbox";

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
No refraction effects - just clean, accessible checkboxes.

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
    disabled: {
      control: "boolean",
      description: "Whether the checkbox is disabled",
    },
    label: {
      control: "text",
      description: "Label text for the checkbox",
    },
  },
  args: {
    disabled: false,
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
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Checkbox label="Unchecked Disabled" disabled defaultChecked={false} />
      <Checkbox label="Checked Disabled" disabled defaultChecked />
      <Checkbox
        label="Indeterminate Disabled"
        disabled
        defaultChecked="indeterminate"
      />
    </div>
  ),
};

/**
 * Interactive checkbox with controlled state
 */
export const Interactive: Story = {
  render: () => {
    const [checked, setChecked] = useState<boolean | "indeterminate">(false);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Checkbox
          label="Interactive Checkbox"
          checked={checked}
          onCheckedChange={setChecked}
        />
        <div style={{ fontSize: "14px", color: "#666" }}>
          Current state:{" "}
          <strong>
            {checked === "indeterminate"
              ? "Indeterminate"
              : checked
                ? "Checked"
                : "Unchecked"}
          </strong>
        </div>
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
