import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Checkbox } from "./checkbox";

import type { Story, StoryDefault } from "@ladle/react";

type CheckboxProps = React.ComponentProps<typeof Checkbox>;

const tones: NonNullable<CheckboxProps["tone"]>[] = [
  "neutral",
  "brand",
  "success",
];

const labelDirections: NonNullable<CheckboxProps["labelDirection"]>[] = [
  "left",
  "right",
];

const ControlledCheckbox = ({
  defaultValue = false,
  ...props
}: Omit<CheckboxProps, "value" | "onChange"> & { defaultValue?: boolean }) => {
  const [value, setValue] = useState(defaultValue);
  return <Checkbox {...props} value={value} onChange={setValue} />;
};

export default {
  title: "Components/Checkbox",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    tone: {
      control: { type: "select", options: tones },
    },
    size: {
      control: { type: "select", options: formInputSizes },
    },
    disabled: { control: { type: "boolean" } },
    invalid: { control: { type: "boolean" } },
    indeterminate: { control: { type: "boolean" } },
    labelDirection: { control: { type: "select", options: labelDirections } },
    label: { control: { type: "text" } },
  },
  args: {
    tone: "neutral",
    size: "md",
    disabled: false,
    invalid: false,
    indeterminate: false,
    labelDirection: "left",
  },
} satisfies StoryDefault<CheckboxProps>;

type Example = {
  label: string;
  props: Omit<CheckboxProps, "value" | "onChange">;
  /** The checked state to render the example in */
  defaultValue: boolean;
  /** When set, a second column renders the same example in the disabled state */
  withDisabled?: boolean;
};

// Constrains the checkbox width so a long label wraps onto multiple lines.
const wrappingLabelClass = css({ maxWidth: "[260px]" });

const examples: Example[] = [
  // Each tone is shown in its checked state, alongside a disabled variant.
  ...tones.map<Example>((tone) => ({
    label: `tone=${tone}`,
    props: { tone },
    defaultValue: true,
    withDisabled: true,
  })),
  { label: "unchecked", props: {}, defaultValue: false, withDisabled: true },
  {
    label: "indeterminate",
    props: { indeterminate: true },
    defaultValue: false,
    withDisabled: true,
  },
  {
    label: "invalid",
    props: { invalid: true },
    defaultValue: false,
    withDisabled: true,
  },
  {
    label: "label",
    props: { label: "Accept terms" },
    defaultValue: true,
    withDisabled: true,
  },
  {
    label: "labelDirection: right",
    props: { label: "Accept terms", labelDirection: "right" },
    defaultValue: true,
  },
  {
    label: "labelAlign: center",
    props: {
      label: "I agree to the terms of service and privacy policy",
      className: wrappingLabelClass,
      alignLabel: "center",
    },
    defaultValue: true,
  },
];

const headingClass = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "neutral.s90",
});

const labelClass = css({
  fontSize: "[12px]",
  color: "neutral.s80",
});

export const Default: Story<CheckboxProps> = () => (
  <div
    className={css({
      display: "grid",
      gridTemplateColumns: "[200px max-content max-content]",
      alignItems: "center",
      columnGap: "[32px]",
      rowGap: "[12px]",
    })}
  >
    <span />
    <span className={headingClass}>Default</span>
    <span className={headingClass}>Disabled</span>
    {examples.map(({ label, props, defaultValue, withDisabled }) => (
      <Fragment key={label}>
        <span className={labelClass}>{label}</span>
        <ControlledCheckbox {...props} defaultValue={defaultValue} />
        {withDisabled ? (
          <ControlledCheckbox {...props} disabled defaultValue={defaultValue} />
        ) : (
          <span />
        )}
      </Fragment>
    ))}
  </div>
);

Default.parameters = {
  actions: { disable: true },
  interactions: { disable: true },
  controls: { disable: true },
};

export const Sizes: Story<CheckboxProps> = () => (
  <div
    className={css({
      display: "flex",
      flexDirection: "column",
      gap: "[16px]",
    })}
  >
    {formInputSizes.map((size) => (
      <div
        key={size}
        className={css({
          display: "flex",
          alignItems: "flex-start",
          gap: "[24px]",
        })}
      >
        <span
          className={css({
            width: "[40px]",
            fontSize: "[12px]",
            color: "neutral.s80",
          })}
        >
          {size}
        </span>
        <ControlledCheckbox size={size} defaultValue />
        <ControlledCheckbox size={size} label="Label" defaultValue />
        <ControlledCheckbox
          size={size}
          label="I agree to the terms of service and privacy policy"
          className={wrappingLabelClass}
          defaultValue
        />
      </div>
    ))}
  </div>
);

Sizes.parameters = {
  actions: { disable: true },
  interactions: { disable: true },
  controls: { disable: true },
};
