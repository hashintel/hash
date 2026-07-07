import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Radio } from "./radio";

import type { Story, StoryDefault } from "@ladle/react";

type RadioProps = React.ComponentProps<typeof Radio>;

const tones: NonNullable<RadioProps["tone"]>[] = [
  "neutral",
  "brand",
  "success",
];

const labelPlacements: NonNullable<RadioProps["labelPlacement"]>[] = [
  "left",
  "right",
];

const ControlledRadio = ({
  defaultValue = false,
  ...props
}: Omit<RadioProps, "value" | "onChange"> & { defaultValue?: boolean }) => {
  const [value, setValue] = useState(defaultValue);
  return <Radio {...props} value={value} onChange={setValue} />;
};

export default {
  title: "Components/Radio",
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
    labelPlacement: { control: { type: "select", options: labelPlacements } },
    label: { control: { type: "text" } },
  },
  args: {
    tone: "neutral",
    size: "md",
    disabled: false,
    invalid: false,
    labelPlacement: "right",
  },
} satisfies StoryDefault<RadioProps>;

type Example = {
  label: string;
  props: Omit<RadioProps, "value" | "onChange">;
  /** The selected state to render the example in */
  defaultValue: boolean;
  /** When set, a second column renders the same example in the disabled state */
  withDisabled?: boolean;
};

// Constrains the radio width so a long label wraps onto multiple lines.
const wrappingLabelClass = css({ maxWidth: "[260px]" });

const examples: Example[] = [
  // Each tone is shown in its selected state, alongside a disabled variant.
  ...tones.map<Example>((tone) => ({
    label: `tone=${tone}`,
    props: { tone },
    defaultValue: true,
    withDisabled: true,
  })),
  { label: "unselected", props: {}, defaultValue: false, withDisabled: true },
  {
    label: "invalid",
    props: { invalid: true },
    defaultValue: false,
    withDisabled: true,
  },
  {
    label: "label",
    props: { label: "Send me updates" },
    defaultValue: true,
    withDisabled: true,
  },
  {
    label: "labelPlacement: left",
    props: { label: "Send me updates", labelPlacement: "left" },
    defaultValue: true,
  },
  {
    label: "labelAlign: center",
    props: {
      label: "I agree to the terms of service and privacy policy",
      className: wrappingLabelClass,
      labelAlign: "center",
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

export const Default: Story<RadioProps> = () => (
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
        <ControlledRadio {...props} defaultValue={defaultValue} />
        {withDisabled ? (
          <ControlledRadio {...props} disabled defaultValue={defaultValue} />
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

export const Sizes: Story<RadioProps> = () => (
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
        <ControlledRadio size={size} defaultValue />
        <ControlledRadio size={size} label="Label" defaultValue />
        <ControlledRadio
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
