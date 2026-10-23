import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Toggle } from "./toggle";

import type { Meta, StoryObj } from "@storybook/react-vite";

type ToggleProps = React.ComponentProps<typeof Toggle>;

const tones: NonNullable<ToggleProps["tone"]>[] = [
  "neutral",
  "brand",
  "success",
];

const offTones: NonNullable<ToggleProps["offTone"]>[] = ["neutral", "error"];

const ControlledToggle = ({
  defaultValue = false,
  ...props
}: Omit<ToggleProps, "value" | "onChange"> & { defaultValue?: boolean }) => {
  const [value, setValue] = useState(defaultValue);
  return <Toggle {...props} value={value} onChange={setValue} />;
};

const meta = {
  title: "Components/Toggle",
  component: Toggle,
  args: {
    tone: "neutral",
    offTone: "neutral",
    size: "md",
    disabled: false,
    invalid: false,
  },
} satisfies Meta<ToggleProps>;

export default meta;

type Story = StoryObj<ToggleProps>;

type Example = {
  label: string;
  props: Omit<ToggleProps, "value" | "onChange">;
  /** The checked state to render the example in */
  defaultValue: boolean;
  /** When set, a second column renders the same example in the disabled state */
  withDisabled?: boolean;
};

const examples: Example[] = [
  // Each tone is shown in its on state, alongside a disabled variant.
  ...tones.map<Example>((tone) => ({
    label: `tone=${tone}`,
    props: { tone },
    defaultValue: true,
    withDisabled: true,
  })),
  // Each offTone is shown in its off state, alongside a disabled variant.
  ...offTones.map<Example>((offTone) => ({
    label: `offTone=${offTone}`,
    props: { offTone },
    defaultValue: false,
    withDisabled: true,
  })),
  { label: "invalid", props: { invalid: true }, defaultValue: false },
  { label: "labelOnText", props: { labelOnText: "On" }, defaultValue: true },
  {
    label: "labelOffText",
    props: { labelOffText: "Off" },
    defaultValue: false,
  },
  {
    label: "disabled + labelOnText + labelOffText",
    props: {
      labelOnText: "Toggle on",
      labelOffText: "Toggle off",
      disabled: true,
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

export const Default: Story = {
  render: (args: ToggleProps) => (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: "[260px max-content max-content]",
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
          <ControlledToggle {...args} {...props} defaultValue={defaultValue} />
          {withDisabled ? (
            <ControlledToggle
              {...args}
              {...props}
              disabled
              defaultValue={defaultValue}
            />
          ) : (
            <span />
          )}
        </Fragment>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args: ToggleProps) => (
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
            alignItems: "center",
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
          <ControlledToggle {...args} size={size} />
          <ControlledToggle
            {...args}
            size={size}
            labelOnText="On"
            labelOffText="Off"
          />
        </div>
      ))}
    </div>
  ),
};
