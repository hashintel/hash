import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";

import { Checkbox, type CheckboxProps } from "./checkbox";

export default {
  title: "Components/Checkbox",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    checked: {
      control: { type: "radio" },
      options: [false, true, "indeterminate"],
      description: "The checked state of the checkbox",
    },
    disabled: {
      control: { type: "boolean" },
      description: "Whether the checkbox is disabled",
    },
    invalid: {
      control: { type: "boolean" },
      description: "Whether the checkbox is in an invalid state",
    },
    readOnly: {
      control: { type: "boolean" },
      description: "Whether the checkbox is read-only",
    },
    required: {
      control: { type: "boolean" },
      description: "Whether the checkbox is required",
    },
    label: {
      control: { type: "text" },
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
} satisfies StoryDefault<CheckboxProps>;

/**
 * Default checkbox in unchecked state
 */
export const Default: Story<CheckboxProps> = (args) => <Checkbox {...args} />;
Default.args = {
  checked: false,
};

/**
 * Checkbox in checked state
 */
export const Checked: Story<CheckboxProps> = (args) => <Checkbox {...args} />;
Checked.args = {
  checked: true,
};

/**
 * Checkbox in indeterminate state (partial selection)
 */
export const Indeterminate: Story<CheckboxProps> = (args) => (
  <Checkbox {...args} />
);
Indeterminate.args = {
  checked: "indeterminate",
};

/**
 * Disabled checkbox states
 */
export const Disabled: Story<CheckboxProps> = () => (
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
);
Disabled.parameters = {
  actions: { disable: true },
  interactions: { disable: true },
  controls: { disable: true },
};

/**
 * Interactive checkbox with controlled state
 */
export const Interactive: Story<CheckboxProps> = () => {
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
};
Interactive.parameters = {
  actions: { disable: true },
  interactions: { disable: true },
  controls: { disable: true },
};
