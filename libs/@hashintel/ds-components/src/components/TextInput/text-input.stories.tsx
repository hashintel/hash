import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { TextInput } from "./text-input";

import type { FormInputWidth } from "../../util/form-shared";
import type { Story, StoryDefault } from "@ladle/react";

type TextInputProps = React.ComponentProps<typeof TextInput>;
type Variant = NonNullable<TextInputProps["variant"]>;
type Align = NonNullable<TextInputProps["align"]>;

const variants = ["default", "subtle"] as const satisfies readonly Variant[];
const alignments = [
  "left",
  "center",
  "right",
] as const satisfies readonly Align[];
const widths = [
  "xs",
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

const Controlled = (props: TextInputProps) => {
  const [value, setValue] = useState(String(props.value ?? ""));
  return (
    <TextInput {...props} value={value} onChange={(val) => setValue(val)} />
  );
};

const ClearableInput = (
  props: Omit<TextInputProps, "clearable" | "onChange">,
) => {
  const [value, setValue] = useState(String(props.value ?? ""));
  return (
    <TextInput
      {...props}
      value={value}
      onChange={(val) => setValue(val)}
      clearable={{ clearable: true, onClear: () => setValue("") }}
    />
  );
};

const StyledNumberInput = ({
  clearable,
  ...props
}: Omit<TextInputProps, "value" | "onChange" | "styledValue" | "clearable"> & {
  clearable?: boolean;
}) => {
  const [value, setValue] = useState("1234567890");
  return (
    <TextInput
      {...props}
      value={value}
      onChange={(val) => setValue(val)}
      clearable={
        clearable ? { clearable: true, onClear: () => setValue("") } : undefined
      }
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
  background: "neutral.s10",
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
  {
    key: "editIcon",
    label: "Show Edit Icon",
    extraProps: { showEditIcon: true },
  },
];

const stateColumns = [
  { key: "withValue", label: "With value", withValue: true, readonly: false },
  { key: "empty", label: "Empty", withValue: false, readonly: false },
  { key: "readonly", label: "Read-only", withValue: true, readonly: true },
];

export default {
  title: "Components/TextInput",
  argTypes: {
    placeholder: {
      control: { type: "text" },
      description: "Placeholder text shown when the input is empty",
    },
    disabled: {
      control: { type: "boolean" },
      description: "Disable the input",
    },
    invalid: {
      control: { type: "boolean" },
      description: "Mark the input as invalid",
    },
    readonly: {
      control: { type: "boolean" },
      description: "Render the input as read-only text",
    },
    loading: {
      control: { type: "boolean" },
      description: "Show a loading indicator",
    },
    variant: {
      control: { type: "radio" },
      options: variants,
      description: "Visual variant of the input",
    },
    align: {
      control: { type: "radio" },
      options: alignments,
      description: "Text alignment within the input",
    },
    size: {
      control: { type: "select" },
      options: formInputSizes,
      description: "Input height",
    },
    width: {
      control: { type: "select" },
      options: widths,
      description: "Preset input width",
    },
    showEditIcon: {
      control: { type: "boolean" },
      description: "Show an edit icon inside the input",
    },
  },
  args: {
    disabled: false,
    invalid: false,
    readonly: false,
    loading: false,
    variant: "default",
    align: "left",
    size: "md",
    showEditIcon: false,
  },
} satisfies StoryDefault<TextInputProps>;

export const Default: Story<TextInputProps> = (args) => (
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
                  {...args}
                  value={value}
                  variant={variant}
                  readonly={col.readonly}
                  {...row.extraProps}
                />
              ) : (
                <Controlled
                  key={cellKey}
                  {...args}
                  value={value}
                  onChange={noop}
                  variant={variant}
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

export const Alignment: Story<TextInputProps> = (args) => (
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
          {...args}
          value={`Align: ${align}`}
          onChange={noop}
          align={align}
        />
        <Controlled
          {...args}
          value={`Align: ${align}`}
          onChange={noop}
          align={align}
          readonly
        />
      </Fragment>
    ))}
  </div>
);

export const StyledValue: Story<TextInputProps> = ({
  clearable: _clearable,
  ...args
}) => (
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
        <StyledNumberInput {...args} variant={variant} />
        <StyledNumberInput {...args} variant={variant} readonly />
      </Fragment>
    ))}
    {variants.map((variant) => (
      <Fragment key={`sink-${variant}`}>
        <StyledNumberInput
          {...args}
          variant={variant}
          prefix={{ iconName: "search" }}
          suffix={{ text: "kg" }}
          loading
          clearable
        />
        <StyledNumberInput
          {...args}
          variant={variant}
          prefix={{ iconName: "search" }}
          suffix={{ text: "kg" }}
          loading
          clearable
          readonly
        />
      </Fragment>
    ))}
  </div>
);

export const Size: Story<TextInputProps> = (args) => (
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
          {...args}
          value={rv.label}
          onChange={noop}
          size={size}
          variant={rv.variant}
          readonly={rv.readonly}
        />
      )),
    ])}

    <span key="kitchen-sink" style={subheadingStyle}>
      With items
    </span>
    {...formInputSizes.map((size) => (
      <ClearableInput
        key={`sink-${size}`}
        {...args}
        value="Kitchen Sink"
        prefix={{ iconName: "search" }}
        suffix={{ text: "kg" }}
        loading
        size={size}
      />
    ))}
  </div>
);

export const Widths: Story<TextInputProps> = (args) => (
  <div className={sectionStyle}>
    {rowVariants.map((rv) => (
      <div key={rv.label} className={groupStyle}>
        <h3 style={headingStyle}>{rv.label}</h3>
        {widths.map((width) => (
          <Controlled
            key={width}
            {...args}
            value={`Width: ${width}`}
            onChange={noop}
            variant={rv.variant}
            readonly={rv.readonly}
            width={width}
          />
        ))}
        {!rv.readonly && (
          <ClearableInput
            {...args}
            value="Width: fitContent with all the trimmings"
            variant={rv.variant}
            width="fitContent"
            prefix={{ iconName: "search" }}
            suffix={{ text: "kg" }}
            loading
            showEditIcon
          />
        )}
      </div>
    ))}
  </div>
);

type PrefixSuffixRow = {
  key: string;
  clearable?: boolean;
  props: Omit<TextInputProps, "variant" | "width" | "onChange">;
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
    key: "kitchen-sink-button-disabled",
    clearable: true,
    props: {
      value: "Kitchen Sink Disabled",
      prefix: { iconName: "search", onClick: noop, disabled: true },
      suffix: { iconName: "close", onClick: noop },
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
      value: "Invalid Buttons",
      prefix: { iconName: "search", onClick: noop },
      suffix: { iconName: "close", onClick: noop },
      loading: true,
      invalid: true,
    },
  },
  {
    key: "kitchen-sink-edit",
    clearable: true,
    props: {
      value: "Kitchen Sink Edit Icon",
      prefix: { iconName: "search" },
      suffix: { text: "kg" },
      loading: true,
      showEditIcon: true,
    },
  },
  {
    key: "prefix-suffix-interactive-button",
    props: {
      value: "",
      prefix: {
        type: "interactive",
        content: (
          <button type="button" onClick={noop} style={{ outline: "none" }}>
            Go
          </button>
        ),
      },
      suffix: {
        type: "interactive",
        content: (
          <button type="button" onClick={noop} style={{ outline: "none" }}>
            Clear
          </button>
        ),
      },
      placeholder: "Interactive button prefix + suffix",
    },
  },
];

export const PrefixAndSuffix: Story<TextInputProps> = (args) => (
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
            {...args}
            {...row.props}
            variant={variant}
          />
        ) : (
          <Controlled
            key={`${row.key}-${variant}`}
            {...args}
            {...row.props}
            onChange={noop}
            variant={variant}
          />
        ),
      ),
    )}
  </div>
);
