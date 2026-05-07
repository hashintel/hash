import { css } from "@hashintel/ds-helpers/css";
import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";

import type { FormInputWidth } from "../../util/form-shared";
import { formInputSizes } from "../../util/form-shared";
import { BaseInput } from "./base-input";

type BaseInputProps = React.ComponentProps<typeof BaseInput>;
type Variant = NonNullable<BaseInputProps["variant"]>;
type Align = NonNullable<BaseInputProps["align"]>;

const variants = ["default", "subtle"] as const satisfies readonly Variant[];
const alignments = [
  "left",
  "center",
  "right",
] as const satisfies readonly Align[];
const widths = [
  "sm",
  "md",
  "lg",
  "fullWidth",
  "fitContent",
] as const satisfies readonly FormInputWidth[];

type RowVariant = {
  variant: Variant;
  readonly: boolean;
  label: string;
};

const rowVariants: RowVariant[] = [
  { variant: "default", readonly: false, label: "Default" },
  { variant: "subtle", readonly: false, label: "Subtle" },
  { variant: "default", readonly: true, label: "Default (readonly)" },
  { variant: "subtle", readonly: true, label: "Subtle (readonly)" },
];

const noop = () => {};

const Controlled = (props: BaseInputProps) => {
  const [value, setValue] = useState(String(props.value ?? ""));
  return (
    <BaseInput {...props} value={value} onChange={(val) => setValue(val)} />
  );
};

const ClearableInput = (
  props: Omit<BaseInputProps, "clearable" | "onChange">,
) => {
  const [value, setValue] = useState(String(props.value ?? ""));
  return (
    <BaseInput
      {...props}
      value={value}
      onChange={(val) => setValue(val)}
      clearable={{ clearable: true, onClear: () => setValue("") }}
    />
  );
};

const StyledNumberInput = (
  props: Omit<BaseInputProps, "value" | "onChange" | "styledValue">,
) => {
  const [value, setValue] = useState("1234567890");
  return (
    <BaseInput
      {...props}
      value={value}
      onChange={(val) => setValue(val)}
      styledValue={
        <span style={{ color: "green", fontWeight: "bold" }}>
          {Number(value).toLocaleString() || value}
        </span>
      }
    />
  );
};

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[32px]",
});

const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const rowStyle = css({
  display: "flex",
  flexDirection: "row",
  gap: "[32px]",
  alignItems: "flex-start",
});

const columnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const headingStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  textTransform: "capitalize",
  margin: 0,
};

const subheadingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#666",
};

const StateMatrix = ({
  variant,
  readonly,
}: {
  variant: Variant;
  readonly: boolean;
}) => (
  <div className={groupStyle}>
    <h3 style={headingStyle}>{variant}</h3>
    <div className={rowStyle}>
      <div className={columnStyle}>
        <span style={subheadingStyle}>Empty</span>
        <Controlled
          value=""
          onChange={noop}
          variant={variant}
          readonly={readonly}
          width="md"
          disabled
        />
        <Controlled
          value=""
          onChange={noop}
          variant={variant}
          readonly={readonly}
          width="md"
          invalid
        />
        <Controlled
          value=""
          onChange={noop}
          variant={variant}
          readonly={readonly}
          width="md"
          loading
        />
        <ClearableInput
          value=""
          variant={variant}
          readonly={readonly}
          width="md"
        />
        <Controlled
          value=""
          onChange={noop}
          variant={variant}
          readonly={readonly}
          width="md"
          placeholder="Placeholder text..."
        />
      </div>
      <div className={columnStyle}>
        <span style={subheadingStyle}>With value</span>
        <Controlled
          value="Some text"
          onChange={noop}
          variant={variant}
          readonly={readonly}
          width="md"
          disabled
        />
        <Controlled
          value="Some text"
          onChange={noop}
          variant={variant}
          readonly={readonly}
          width="md"
          invalid
        />
        <Controlled
          value="Some text"
          onChange={noop}
          variant={variant}
          readonly={readonly}
          width="md"
          loading
        />
        <ClearableInput
          value="Some text"
          variant={variant}
          readonly={readonly}
          width="md"
        />
        <Controlled
          value="Some text"
          onChange={noop}
          variant={variant}
          readonly={readonly}
          width="md"
          placeholder="Placeholder text..."
        />
      </div>
    </div>
  </div>
);

export default {
  title: "Components/BaseInput",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div className={sectionStyle}>
    {variants.map((variant) => (
      <StateMatrix key={variant} variant={variant} readonly={false} />
    ))}
  </div>
);

export const ReadOnly: Story = () => (
  <div className={sectionStyle}>
    {variants.map((variant) => (
      <StateMatrix key={variant} variant={variant} readonly />
    ))}
  </div>
);

export const Alignment: Story = () => (
  <div className={rowStyle}>
    <div className={columnStyle}>
      <span style={subheadingStyle}>Editable</span>
      {alignments.map((align) => (
        <Controlled
          key={align}
          value={`Align: ${align}`}
          onChange={noop}
          align={align}
          width="md"
        />
      ))}
    </div>
    <div className={columnStyle}>
      <span style={subheadingStyle}>Read-only</span>
      {alignments.map((align) => (
        <Controlled
          key={align}
          value={`Align: ${align}`}
          onChange={noop}
          align={align}
          width="md"
          readonly
        />
      ))}
    </div>
  </div>
);

export const StyledValue: Story = () => (
  <div className={rowStyle}>
    <div className={columnStyle}>
      <span style={subheadingStyle}>Editable</span>
      {variants.map((variant) => (
        <StyledNumberInput key={variant} variant={variant} width="md" />
      ))}
    </div>
    <div className={columnStyle}>
      <span style={subheadingStyle}>Read-only</span>
      {variants.map((variant) => (
        <StyledNumberInput
          key={variant}
          variant={variant}
          width="md"
          readonly
        />
      ))}
    </div>
  </div>
);

export const Size: Story = () => (
  <div className={rowStyle}>
    {formInputSizes.map((size) => (
      <div key={size} className={columnStyle}>
        <span style={subheadingStyle}>Size: {size}</span>
        {rowVariants.map((rv) => (
          <Controlled
            key={rv.label}
            value={rv.label}
            onChange={noop}
            size={size}
            variant={rv.variant}
            readonly={rv.readonly}
            width="md"
          />
        ))}
      </div>
    ))}
  </div>
);

export const Widths: Story = () => (
  <div className={sectionStyle}>
    {rowVariants.map((rv) => (
      <div key={rv.label} className={groupStyle}>
        <h3 style={headingStyle}>{rv.label}</h3>
        {widths.map((width) => (
          <Controlled
            key={width}
            value={`Width: ${width}`}
            onChange={noop}
            variant={rv.variant}
            readonly={rv.readonly}
            width={width}
          />
        ))}
      </div>
    ))}
  </div>
);

export const PrefixAndSuffix: Story = () => (
  <div className={groupStyle}>
    <Controlled
      value=""
      onChange={noop}
      prefix={{ text: "$" }}
      placeholder="Prefix text"
      width="md"
    />
    <Controlled
      value=""
      onChange={noop}
      prefix={{ iconName: "search", onClick: noop }}
      placeholder="Prefix button"
      width="md"
    />
    <Controlled
      value=""
      onChange={noop}
      suffix={{ text: "kg" }}
      placeholder="Suffix text"
      width="md"
    />
    <Controlled
      value=""
      onChange={noop}
      suffix={{ iconName: "close", onClick: noop }}
      placeholder="Suffix button"
      width="md"
    />
    <Controlled
      value=""
      onChange={noop}
      prefix={{ iconName: "search" }}
      suffix={{ text: "CMD+K" }}
      placeholder="Prefix + suffix"
      width="md"
    />
    <ClearableInput
      value="Loading"
      prefix={{ iconName: "search" }}
      suffix={{ text: "kg" }}
      width="md"
      loading
    />
    <ClearableInput
      value="Disabled"
      prefix={{ iconName: "search" }}
      suffix={{ text: "kg" }}
      width="md"
      loading
      disabled
    />
    <ClearableInput
      value="Invalid"
      prefix={{ iconName: "search" }}
      suffix={{ text: "kg" }}
      width="md"
      loading
      invalid
    />
  </div>
);
