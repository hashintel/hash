import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Toggle } from "./toggle";

import type { Story, StoryDefault } from "@ladle/react";

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

export default {
  title: "Components/Toggle",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    tone: {
      control: { type: "select", options: tones },
    },
    offTone: {
      control: { type: "select", options: offTones },
    },
    size: {
      control: { type: "select", options: formInputSizes },
    },
    disabled: { control: { type: "boolean" } },
    invalid: { control: { type: "boolean" } },
    labelOnText: { control: { type: "text" } },
    labelOffText: { control: { type: "text" } },
  },
  args: {
    tone: "neutral",
    offTone: "neutral",
    size: "md",
    disabled: false,
    invalid: false,
  },
} satisfies StoryDefault<ToggleProps>;

type Example = {
  label: string;
  props: Omit<ToggleProps, "value" | "onChange">;
};

const examples: Example[] = [
  ...tones.flatMap<Example>((tone) => [
    { label: `tone=${tone}`, props: { tone } },
    { label: `tone=${tone}, disabled`, props: { tone, disabled: true } },
  ]),
  { label: `offTone=error`, props: { offTone: "error" } },
  {
    label: `offTone=error, disabled`,
    props: { offTone: "error", disabled: true },
  },
  { label: "invalid", props: { invalid: true } },
  { label: "labelOnText", props: { labelOnText: "On" } },
  { label: "labelOffText", props: { labelOffText: "Off" } },
  {
    label: "labelOnText + labelOffText",
    props: { labelOnText: "On", labelOffText: "Off" },
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

export const Default: Story<ToggleProps> = () => (
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
    <span className={headingClass}>On</span>
    <span className={headingClass}>Off</span>
    {examples.map(({ label, props }) => (
      <Fragment key={label}>
        <span className={labelClass}>{label}</span>
        <ControlledToggle {...props} defaultValue />
        <ControlledToggle {...props} defaultValue={false} />
      </Fragment>
    ))}
  </div>
);

Default.parameters = {
  actions: { disable: true },
  interactions: { disable: true },
  controls: { disable: true },
};

export const Sizes: Story<ToggleProps> = () => (
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
        <ControlledToggle size={size} />
        <ControlledToggle size={size} labelOnText="On" labelOffText="Off" />
      </div>
    ))}
  </div>
);

Sizes.parameters = {
  actions: { disable: true },
  interactions: { disable: true },
  controls: { disable: true },
};
