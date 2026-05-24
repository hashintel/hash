import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { NumberInput } from "./number-input";

import type { FormInputWidth } from "../../util/form-shared";
import type { Story, StoryDefault } from "@ladle/react";

type NumberInputProps = React.ComponentProps<typeof NumberInput>;
type Variant = NonNullable<NumberInputProps["variant"]>;
type Align = NonNullable<NumberInputProps["align"]>;

const variants = ["default", "subtle"] as const satisfies readonly Variant[];
const alignments = ["left", "center", "right"] as const satisfies readonly Align[];
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

const Controlled = ({
  type = "integer",
  ...props
}: Omit<NumberInputProps, "type"> & {
  type?: "integer" | "float";
}) => {
  const [value, setValue] = useState(props.value ?? null);
  return <NumberInput {...props} value={value} onChange={(val) => setValue(val)} type={type} />;
};

const ClearableInput = ({
  type = "integer",
  ...props
}: Omit<NumberInputProps, "clearable" | "onChange" | "type"> & {
  type?: "integer" | "float";
}) => {
  const [value, setValue] = useState(props.value ?? null);
  return (
    <NumberInput
      {...props}
      value={value}
      onChange={(val) => setValue(val)}
      clearable={{ clearable: true, onClear: () => setValue(null) }}
      type={type}
    />
  );
};

const StyledNumberInput = ({
  clearable,
  ...props
}: Omit<NumberInputProps, "value" | "onChange" | "styledValue" | "clearable" | "type"> & {
  clearable?: boolean;
}) => {
  const [value, setValue] = useState<number | null>(1234567890);
  return (
    <NumberInput
      {...props}
      value={value}
      onChange={(val) => setValue(val)}
      type="integer"
      clearable={clearable ? { clearable: true, onClear: () => setValue(null) } : undefined}
      styledValue={
        value === null ? null : (
          <span style={{ color: "green", fontWeight: "bold" }}>{value.toLocaleString()}</span>
        )
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
  title: "Components/NumberInput",
} satisfies StoryDefault;

const StateGrid = ({ type, filledValue }: { type: "integer" | "float"; filledValue: number }) => (
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
              const value = col.withValue ? filledValue : null;
              const cellKey = `${row.key}-${col.key}`;
              return row.clearable ? (
                <ClearableInput
                  key={cellKey}
                  value={value}
                  variant={variant}
                  readonly={col.readonly}
                  type={type}
                  {...row.extraProps}
                />
              ) : (
                <Controlled
                  key={cellKey}
                  value={value}
                  onChange={noop}
                  variant={variant}
                  readonly={col.readonly}
                  type={type}
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

export const Default: Story = () => <StateGrid type="integer" filledValue={1234} />;

export const Float: Story = () => <StateGrid type="float" filledValue={1234.56} />;

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
        <Controlled value={1234} onChange={noop} align={align} />
        <Controlled value={1234} onChange={noop} align={align} readonly />
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
        <StyledNumberInput variant={variant} />
        <StyledNumberInput variant={variant} readonly />
      </Fragment>
    ))}
    {variants.map((variant) => (
      <Fragment key={`sink-${variant}`}>
        <StyledNumberInput
          variant={variant}
          prefix={{ iconName: "search" }}
          suffix={{ text: "kg" }}
          loading
          clearable
        />
        <StyledNumberInput
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
          value={1234}
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
        value={1234567890}
        prefix={{ iconName: "search" }}
        suffix={{ text: "kg" }}
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
            value={1234567890}
            onChange={noop}
            variant={rv.variant}
            readonly={rv.readonly}
            width={width}
          />
        ))}
        {!rv.readonly && (
          <ClearableInput
            value={1234567890}
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
  props: Omit<NumberInputProps, "variant" | "width" | "onChange" | "type">;
};

const prefixSuffixRows: PrefixSuffixRow[] = [
  {
    key: "prefix-text",
    props: {
      value: null,
      prefix: { text: "$" },
      placeholder: "Prefix text",
    },
  },
  {
    key: "prefix-button",
    props: {
      value: null,
      prefix: { iconName: "search", onClick: noop },
      placeholder: "Prefix button",
    },
  },
  {
    key: "suffix-text",
    props: {
      value: null,
      suffix: { text: "kg" },
      placeholder: "Suffix text",
    },
  },
  {
    key: "suffix-button",
    props: {
      value: null,
      suffix: { iconName: "close", onClick: noop },
      placeholder: "Suffix button",
    },
  },
  {
    key: "prefix-suffix",
    props: {
      value: null,
      prefix: { iconName: "search" },
      suffix: { text: "CMD+K" },
      placeholder: "Prefix + suffix",
    },
  },
  {
    key: "prefix-suffix-button",
    props: {
      value: null,
      prefix: { iconName: "search", onClick: noop },
      suffix: { iconName: "close", onClick: noop },
      placeholder: "Prefix + suffix button",
    },
  },
  {
    key: "kitchen-sink",
    clearable: true,
    props: {
      value: 1234567890,
      prefix: { iconName: "search" },
      suffix: { text: "kg" },
      loading: true,
    },
  },
  {
    key: "kitchen-sink-disabled",
    clearable: true,
    props: {
      value: 1234567890,
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
      value: 1234567890,
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
      value: 1234567890,
      prefix: { iconName: "search" },
      suffix: { text: "kg" },
      loading: true,
      invalid: true,
    },
  },
  {
    key: "prefix-suffix-button-loading-invalid",
    props: {
      value: 1234567890,
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
      value: 1234567890,
      prefix: { iconName: "search" },
      suffix: { text: "kg" },
      loading: true,
      showEditIcon: true,
    },
  },
  {
    key: "prefix-suffix-interactive-button",
    props: {
      value: null,
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
          <ClearableInput key={`${row.key}-${variant}`} {...row.props} variant={variant} />
        ) : (
          <Controlled
            key={`${row.key}-${variant}`}
            {...row.props}
            onChange={noop}
            variant={variant}
          />
        ),
      ),
    )}
  </div>
);
