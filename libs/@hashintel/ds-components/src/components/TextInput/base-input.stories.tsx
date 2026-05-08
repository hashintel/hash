import { css } from "@hashintel/ds-helpers/css";
import type { Story, StoryDefault } from "@ladle/react";
import { Fragment, useState } from "react";

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

const stateRows = [
  { key: "disabled", label: "Disabled", extraProps: { disabled: true } },
  { key: "invalid", label: "Invalid", extraProps: { invalid: true } },
  { key: "loading", label: "Loading", extraProps: { loading: true } },
  { key: "clearable", label: "Clearable", clearable: true, extraProps: {} },
  {
    key: "placeholder",
    label: "Placeholder",
    extraProps: { placeholder: "Placeholder text..." },
  },
];

const stateColumns = [
  { key: "withValue", label: "With value", withValue: true, readonly: false },
  { key: "empty", label: "Empty", withValue: false, readonly: false },
  { key: "readonly", label: "Read-only", withValue: true, readonly: true },
];

export default {
  title: "Components/BaseInput",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div className={sectionStyle}>
    {variants.map((variant) => (
      <div key={variant} className={groupStyle}>
        <h3 style={headingStyle}>{variant}</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto auto",
            columnGap: 32,
            rowGap: 12,
            alignItems: "center",
            justifyContent: "start",
          }}
        >
          {stateColumns.map((col) => (
            <span key={col.key} style={subheadingStyle}>
              {col.label}
            </span>
          ))}
          {stateRows.flatMap((row) =>
            stateColumns.map((col) => {
              const value = col.withValue ? row.label : "";
              const cellKey = `${row.key}-${col.key}`;
              return row.clearable ? (
                <ClearableInput
                  key={cellKey}
                  value={value}
                  variant={variant}
                  width="md"
                  readonly={col.readonly}
                  {...row.extraProps}
                />
              ) : (
                <Controlled
                  key={cellKey}
                  value={value}
                  onChange={noop}
                  variant={variant}
                  width="md"
                  readonly={col.readonly}
                  {...row.extraProps}
                />
              );
            }),
          )}
        </div>
      </div>
    ))}
  </div>
);

export const Alignment: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "auto auto",
      columnGap: 32,
      rowGap: 12,
      alignItems: "center",
      justifyContent: "start",
    }}
  >
    <span style={subheadingStyle}>Editable</span>
    <span style={subheadingStyle}>Read-only</span>
    {alignments.map((align) => (
      <Fragment key={align}>
        <Controlled
          value={`Align: ${align}`}
          onChange={noop}
          align={align}
          width="md"
        />
        <Controlled
          value={`Align: ${align}`}
          onChange={noop}
          align={align}
          width="md"
          readonly
        />
      </Fragment>
    ))}
  </div>
);

export const StyledValue: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "auto auto",
      columnGap: 32,
      rowGap: 12,
      alignItems: "center",
      justifyContent: "start",
    }}
  >
    <span style={subheadingStyle}>Editable</span>
    <span style={subheadingStyle}>Read-only</span>
    {variants.map((variant) => (
      <Fragment key={variant}>
        <StyledNumberInput variant={variant} width="md" />
        <StyledNumberInput variant={variant} width="md" readonly />
      </Fragment>
    ))}
  </div>
);

export const Size: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `auto repeat(${formInputSizes.length}, minmax(0, 1fr))`,
      columnGap: 32,
      rowGap: 12,
      alignItems: "center",
      width: "100%",
      maxWidth: "100%",
    }}
  >
    <span />
    {formInputSizes.map((size) => (
      <span key={size} style={subheadingStyle}>
        {size}
      </span>
    ))}
    {rowVariants.flatMap((rv) => [
      <span key={`${rv.label}-label`} style={subheadingStyle}>
        {rv.label}
      </span>,
      ...formInputSizes.map((size) => (
        <Controlled
          key={`${rv.label}-${size}`}
          value={rv.label}
          onChange={noop}
          size={size}
          variant={rv.variant}
          readonly={rv.readonly}
          width="fullWidth"
        />
      )),
    ])}

    <span key="kitchen-sink" style={subheadingStyle}>
      With items
    </span>
    {...formInputSizes.map((size) => (
      <ClearableInput
        key={`sink-${size}`}
        value="Kitchen Sink"
        prefix={{ iconName: "search" }}
        suffix={{ text: "kg" }}
        width="fullWidth"
        loading
        size={size}
      />
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

type PrefixSuffixRow = {
  key: string;
  clearable?: boolean;
  props: Omit<BaseInputProps, "variant" | "width" | "onChange">;
};

const prefixSuffixRows: PrefixSuffixRow[] = [
  {
    key: "prefix-text",
    props: {
      value: "",
      prefix: { text: "$" },
      placeholder: "Prefix text",
    },
  },
  {
    key: "prefix-button",
    props: {
      value: "",
      prefix: { iconName: "search", onClick: noop },
      placeholder: "Prefix button",
    },
  },
  {
    key: "suffix-text",
    props: {
      value: "",
      suffix: { text: "kg" },
      placeholder: "Suffix text",
    },
  },
  {
    key: "suffix-button",
    props: {
      value: "",
      suffix: { iconName: "close", onClick: noop },
      placeholder: "Suffix button",
    },
  },
  {
    key: "prefix-suffix",
    props: {
      value: "",
      prefix: { iconName: "search" },
      suffix: { text: "CMD+K" },
      placeholder: "Prefix + suffix",
    },
  },
  {
    key: "prefix-suffix-button",
    props: {
      value: "",
      prefix: { iconName: "search", onClick: noop },
      suffix: { iconName: "close", onClick: noop },
      placeholder: "Prefix + suffix button",
    },
  },
  {
    key: "kitchen-sink",
    clearable: true,
    props: {
      value: "Kitchen Sink",
      prefix: { iconName: "search" },
      suffix: { text: "kg" },
      loading: true,
    },
  },
  {
    key: "kitchen-sink-disabled",
    clearable: true,
    props: {
      value: "Kitchen Sink Disabled",
      prefix: { iconName: "search" },
      suffix: { text: "kg" },
      loading: true,
      disabled: true,
    },
  },
  {
    key: "kitchen-sink-invalid",
    clearable: true,
    props: {
      value: "Kitchen Sink Invalid",
      prefix: { iconName: "search" },
      suffix: { text: "kg" },
      loading: true,
      invalid: true,
    },
  },
  {
    key: "prefix-suffix-button-loading-invalid",
    props: {
      value: "",
      prefix: { iconName: "search", onClick: noop },
      suffix: { iconName: "close", onClick: noop },
      placeholder: "Prefix + suffix button",
      loading: true,
      invalid: true,
    },
  },
];

export const PrefixAndSuffix: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "auto auto",
      columnGap: 32,
      rowGap: 12,
      alignItems: "center",
      justifyContent: "start",
    }}
  >
    <span style={subheadingStyle}>Default</span>
    <span style={subheadingStyle}>Subtle</span>
    {prefixSuffixRows.flatMap((row) =>
      variants.map((variant) =>
        row.clearable ? (
          <ClearableInput
            key={`${row.key}-${variant}`}
            {...row.props}
            variant={variant}
            width="md"
          />
        ) : (
          <Controlled
            key={`${row.key}-${variant}`}
            {...row.props}
            onChange={noop}
            variant={variant}
            width="md"
          />
        ),
      ),
    )}
  </div>
);
