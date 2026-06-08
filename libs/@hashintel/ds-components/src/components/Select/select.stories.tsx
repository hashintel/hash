import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Select } from "./select";

import type { FormInputSize, FormInputWidth } from "../../util/form-shared";
import type { ItemOrGroup } from "../SelectableList/selectable-list";
import type { SelectItem } from "./select";
import type { Story, StoryDefault } from "@ladle/react";

type SelectProps = React.ComponentProps<typeof Select>;
type Variant = NonNullable<SelectProps["variant"]>;
type Align = NonNullable<SelectProps["align"]>;

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

const sampleItems: Array<ItemOrGroup<SelectItem>> = [
  { value: "apple", children: "Apple" },
  { value: "banana", children: "Banana" },
  { value: "cherry", children: "Cherry" },
  { value: "date", children: "Date" },
];

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

const Controlled = (
  props: Omit<SelectProps, "items"> & { items?: SelectProps["items"] },
) => {
  const { required: _required, ...rest } = props;
  const [value, setValue] = useState<string | null | undefined>(
    props.value ?? "",
  );
  if (props.required === true) {
    return (
      <Select
        {...(rest as Omit<
          SelectProps,
          "value" | "onChange" | "items" | "required"
        >)}
        required
        items={props.items ?? sampleItems}
        value={value ?? ""}
        onChange={(val) => setValue(val)}
      />
    );
  }
  return (
    <Select
      {...rest}
      items={props.items ?? sampleItems}
      value={value}
      onChange={(val) => setValue(val)}
    />
  );
};

const ClearableSelect = (
  props: Omit<SelectProps, "clearable" | "onChange" | "items"> & {
    items?: SelectProps["items"];
  },
) => {
  const { required: _required, ...rest } = props;
  const [value, setValue] = useState<string | null | undefined>(
    props.value ?? "",
  );
  return (
    <Select
      {...rest}
      items={props.items ?? sampleItems}
      value={value}
      onChange={(val) => setValue(val)}
      clearable={{ clearable: true, onClear: () => setValue(null) }}
    />
  );
};

const ConnectedPair = ({
  left,
  right,
  size,
}: {
  left: Pick<SelectProps, "invalid" | "disabled" | "readonly" | "variant">;
  right: Pick<SelectProps, "invalid" | "disabled" | "readonly" | "variant">;
  size: FormInputSize;
}) => (
  <div style={{ display: "flex", alignItems: "center" }}>
    <Select
      items={sampleItems}
      value="apple"
      onChange={noop}
      size={size}
      connectToRightInput
      {...left}
    />
    <Select
      items={sampleItems}
      value="banana"
      onChange={noop}
      size={size}
      connectToLeftInput
      {...right}
    />
  </div>
);

const sharedConnectedStates: {
  key: string;
  label: string;
  props: Pick<SelectProps, "invalid" | "disabled" | "readonly" | "variant">;
}[] = [
  { key: "default", label: "Default", props: {} },
  { key: "invalid", label: "Invalid", props: { invalid: true } },
  { key: "disabled", label: "Disabled", props: { disabled: true } },
  {
    key: "invalid-disabled",
    label: "Invalid + Disabled",
    props: { invalid: true, disabled: true },
  },
];

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

const stateRows: Array<{
  key: string;
  label: string;
  clearable?: boolean;
  extraProps: Partial<SelectProps>;
}> = [
  { key: "disabled", label: "Disabled", extraProps: { disabled: true } },
  { key: "invalid", label: "Invalid", extraProps: { invalid: true } },
  { key: "loading", label: "Loading", extraProps: { loading: true } },
  { key: "clearable", label: "Clearable", clearable: true, extraProps: {} },
  {
    key: "placeholder-required",
    label: "Placeholder + required",
    extraProps: {
      placeholder: "Placeholder text...",
      required: true,
    } as Partial<SelectProps>,
  },
  {
    key: "placeholder-not-required",
    label: "Placeholder + not required",
    extraProps: { placeholder: "Placeholder text..." },
  },
  {
    key: "required",
    label: "Required",
    extraProps: { required: true } as Partial<SelectProps>,
  },
  {
    key: "hide-arrow",
    label: "Hide arrow",
    extraProps: { hideArrow: true },
  },
  {
    key: "prefix-icon",
    label: "Icon prefix",
    extraProps: { prefix: { iconName: "search" } },
  },
  {
    key: "prefix-text",
    label: "Text prefix",
    extraProps: { prefix: { text: "$" } },
  },
  {
    key: "prefix-content",
    label: "Custom prefix",
    extraProps: {
      prefix: {
        content: (
          <span style={{ fontStyle: "italic", fontWeight: 600 }}>Pre</span>
        ),
      },
    },
  },
];

const stateColumns = [
  { key: "withValue", label: "With value", withValue: true, readonly: false },
  { key: "empty", label: "Empty", withValue: false, readonly: false },
  { key: "readonly", label: "Read-only", withValue: true, readonly: true },
];

export default {
  title: "Components/Select",
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
    hideArrow: {
      control: { type: "boolean" },
      description: "Hide the dropdown arrow",
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
    hideArrow: false,
  },
} satisfies StoryDefault<SelectProps>;

export const Default: Story<SelectProps> = (args) => (
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
          {stateRows.flatMap((row) => {
            const itemsForRow: Array<ItemOrGroup<SelectItem>> = [
              { value: row.label, children: row.label },
              ...sampleItems,
            ];
            return stateColumns.map((col) => {
              const value = col.withValue ? row.label : "";
              const cellKey = `${row.key}-${col.key}`;
              return row.clearable ? (
                <ClearableSelect
                  key={cellKey}
                  {...args}
                  items={itemsForRow}
                  value={value}
                  variant={variant}
                  readonly={col.readonly}
                  {...row.extraProps}
                />
              ) : (
                <Controlled
                  key={cellKey}
                  {...args}
                  items={itemsForRow}
                  value={value}
                  variant={variant}
                  readonly={col.readonly}
                  {...row.extraProps}
                />
              );
            });
          })}
        </div>
      </div>
    ))}
  </div>
);

export const Alignment: Story<SelectProps> = (args) => (
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
        <Controlled {...args} value="apple" align={align} />
        <Controlled {...args} value="apple" align={align} readonly />
      </Fragment>
    ))}
  </div>
);

export const Size: Story<SelectProps> = (args) => (
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
          value="apple"
          size={size}
          variant={rv.variant}
          readonly={rv.readonly}
        />
      )),
    ])}
  </div>
);

export const Widths: Story<SelectProps> = (args) => (
  <div className={sectionStyle}>
    {rowVariants.map((rv) => (
      <div key={rv.label} className={groupStyle}>
        <h3 style={headingStyle}>{rv.label}</h3>
        {widths.map((width) => (
          <Controlled
            key={width}
            {...args}
            value="apple"
            variant={rv.variant}
            readonly={rv.readonly}
            width={width}
          />
        ))}
      </div>
    ))}
  </div>
);

export const Connected: Story = () => (
  <div className={sectionStyle}>
    <div className={groupStyle}>
      <h3 style={headingStyle}>States (md)</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `auto repeat(${sharedConnectedStates.length}, auto)`,
          columnGap: 24,
          rowGap: 12,
          alignItems: "center",
          justifyContent: "start",
        }}
      >
        <span />
        {sharedConnectedStates.map((col) => (
          <span key={`col-${col.key}`} style={subheadingStyle}>
            Right: {col.label}
          </span>
        ))}
        {sharedConnectedStates.flatMap((row) => [
          <span key={`row-${row.key}`} style={subheadingStyle}>
            Left: {row.label}
          </span>,
          ...sharedConnectedStates.map((col) => (
            <ConnectedPair
              key={`${row.key}__${col.key}`}
              size="md"
              left={row.props}
              right={col.props}
            />
          )),
        ])}
      </div>
    </div>
    <div className={groupStyle}>
      <h3 style={headingStyle}>Sizes</h3>
      {formInputSizes.map((size) => (
        <Fragment key={size}>
          <span style={subheadingStyle}>{size}</span>
          <ConnectedPair size={size} left={{}} right={{}} />
        </Fragment>
      ))}
    </div>
  </div>
);
