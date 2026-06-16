import { useState } from "react";

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

const Row = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div
    className={css({
      display: "flex",
      alignItems: "center",
      gap: "[16px]",
    })}
  >
    <span
      className={css({
        width: "[220px]",
        fontSize: "[12px]",
        color: "neutral.s80",
      })}
    >
      {label}
    </span>
    {children}
  </div>
);

export const Default: Story<ToggleProps> = () => (
  <div
    className={css({
      display: "flex",
      flexDirection: "column",
      gap: "[12px]",
    })}
  >
    <Row label="value=true">
      <ControlledToggle defaultValue />
    </Row>
    <Row label="value=false">
      <ControlledToggle defaultValue={false} />
    </Row>
    <Row label="invalid">
      <ControlledToggle invalid />
    </Row>
    <Row label="disabled">
      <ControlledToggle disabled defaultValue />
    </Row>
    <Row label="labelOnText">
      <ControlledToggle labelOnText="On" defaultValue />
    </Row>
    <Row label="labelOffText">
      <ControlledToggle labelOffText="Off" />
    </Row>
    <Row label="labelOnText + labelOffText">
      <ControlledToggle labelOnText="On" labelOffText="Off" />
    </Row>
    {tones.map((tone) => (
      <Row key={tone} label={`tone=${tone}`}>
        <ControlledToggle
          tone={tone}
          labelOnText="On"
          labelOffText="Off"
          defaultValue
        />
      </Row>
    ))}
    {offTones.map((offTone) => (
      <Row key={offTone} label={`offTone=${offTone}`}>
        <ControlledToggle
          offTone={offTone}
          labelOnText="On"
          labelOffText="Off"
          defaultValue={false}
        />
      </Row>
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
