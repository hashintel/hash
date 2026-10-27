import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { MultipleDemo } from "./multi-select.story";
import { Select } from "./select";

import type { FormInputSize, FormInputWidth } from "../../util/form-shared";
import type { ItemOrGroup } from "../../util/SelectableList/selectable-list";
import type { SelectItem } from "./select";
import type { Meta, StoryObj } from "@storybook/react-vite";

type SelectProps = React.ComponentProps<typeof Select>;
type SingleSelectProps = Extract<SelectProps, { multiple?: false }>;
type MultiSelectProps = Extract<SelectProps, { multiple: true }>;
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
  { value: "apple", text: "Apple" },
  { value: "banana", text: "Banana" },
  { value: "cherry", text: "Cherry" },
  { value: "date", text: "Date" },
];

const groupedItemsForRow = (label: string): Array<ItemOrGroup<SelectItem>> => [
  {
    id: "group-one",
    label: "Group one",
    items: [
      { value: label, text: label },
      { value: "apple", text: "Apple" },
      { value: "banana", text: "Banana" },
    ],
  },
  {
    id: "group-two",
    label: "Group two",
    items: [
      { value: "cherry", text: "Cherry" },
      { value: "date", text: "Date" },
    ],
  },
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

const findItemText = (
  items: ReadonlyArray<ItemOrGroup<SelectItem>>,
  value: string,
): string => {
  for (const entry of items) {
    if ("items" in entry) {
      const found = entry.items.find((it) => it.value === value);
      if (found) {
        return found.text;
      }
    } else if (entry.value === value) {
      return entry.text;
    }
  }
  return value;
};

const Controlled = (
  props: Omit<SingleSelectProps, "items"> & {
    items?: SingleSelectProps["items"];
  },
) => {
  const { required: _required, clearable: _clearable, ...rest } = props;
  const [value, setValue] = useState<string | null | undefined>(
    props.value ?? "",
  );
  if (props.required === true) {
    return (
      <Select
        {...(rest as Omit<
          SingleSelectProps,
          "value" | "onChange" | "items" | "required" | "clearable"
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

const ConnectedPair = ({
  left,
  right,
  size,
  ...args
}: Partial<
  Omit<
    SingleSelectProps,
    "items" | "value" | "onChange" | "required" | "clearable"
  >
> & {
  left: Pick<SelectProps, "invalid" | "disabled" | "readonly" | "variant">;
  right: Pick<SelectProps, "invalid" | "disabled" | "readonly" | "variant">;
  size: FormInputSize;
}) => (
  <div style={{ display: "flex", alignItems: "center" }}>
    <Select
      {...args}
      items={sampleItems}
      value="apple"
      onChange={noop}
      size={size}
      connectToRightInput
      {...left}
    />
    <Select
      {...args}
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
  grouped?: boolean;
  extraProps: Partial<SingleSelectProps>;
}> = [
  { key: "disabled", label: "Disabled", extraProps: { disabled: true } },
  { key: "invalid", label: "Invalid", extraProps: { invalid: true } },
  { key: "loading", label: "Loading", extraProps: { loading: true } },
  {
    key: "placeholder-required",
    label: "Placeholder + required",
    extraProps: {
      placeholder: "Placeholder text...",
      required: true,
    } as Partial<SingleSelectProps>,
  },
  {
    key: "placeholder-not-required",
    label: "Placeholder + not required",
    extraProps: { placeholder: "Placeholder text..." },
  },
  {
    key: "required",
    label: "Required",
    extraProps: { required: true } as Partial<SingleSelectProps>,
  },
  {
    key: "searchable",
    label: "Searchable",
    extraProps: { searchable: true },
  },
  {
    key: "long-value",
    label: "A long selected value that truncates",
    extraProps: { width: "sm" },
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
  {
    key: "item-groups",
    label: "Item groups",
    grouped: true,
    extraProps: { required: true },
  },
];

const stateColumns = [
  { key: "withValue", label: "With value", withValue: true, readonly: false },
  { key: "empty", label: "Empty", withValue: false, readonly: false },
  { key: "readonly", label: "Read-only", withValue: true, readonly: true },
];

const meta = {
  title: "Components/Select",
  component: Select,
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
} satisfies Meta<SingleSelectProps>;

export default meta;

type Story = StoryObj<SingleSelectProps>;

export const Default: Story = {
  render: (args: SingleSelectProps) => (
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
              const itemsForRow: Array<ItemOrGroup<SelectItem>> =
                row.key === "loading"
                  ? []
                  : row.grouped
                    ? groupedItemsForRow(row.label)
                    : [{ value: row.label, text: row.label }, ...sampleItems];
              return stateColumns.map((col) => {
                const value =
                  row.key === "loading"
                    ? "loading"
                    : col.withValue
                      ? row.label
                      : "";
                const cellKey = `${row.key}-${col.key}`;
                return (
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
  ),
};

export const Multiple: StoryObj<MultiSelectProps> = {
  render: (args: MultiSelectProps) => <MultipleDemo {...args} />,
};

export const Alignment: Story = {
  render: (args: SingleSelectProps) => (
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
      <span />
      <span style={subheadingStyle}>Editable</span>
      <span style={subheadingStyle}>Read-only</span>
      {alignments.map((align) => (
        <Fragment key={align}>
          <span style={subheadingStyle}>{align}</span>
          <Controlled {...args} value="apple" align={align} width="sm" />
          <Controlled
            {...args}
            value="apple"
            align={align}
            width="sm"
            readonly
          />
        </Fragment>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args: SingleSelectProps) => (
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
  ),
};

// Declared `as const` so the `Select` below can narrow `value` / `onChange` to
// the literal union of these values — see `CustomRender` for the assertion.
const colorItems = [
  { value: "red", text: "Red" },
  { value: "green", text: "Green" },
  { value: "blue", text: "Blue" },
  { value: "orange", text: "Orange" },
] as const;

type ColorValue = (typeof colorItems)[number]["value"];

const ColorSwatch = ({ value }: { value: string }) => (
  <span
    aria-hidden="true"
    style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: value,
      flexShrink: 0,
    }}
  />
);

const renderColorItem = (value: string): React.ReactNode => (
  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <ColorSwatch value={value} />
    {findItemText(colorItems, value)}
  </span>
);

const renderColorSelected = (value: string): React.ReactNode => (
  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <ColorSwatch value={value} />
    <span style={{ fontWeight: 600 }}>{findItemText(colorItems, value)}</span>
  </span>
);

const renderColorDoubleHeight = (value: string): React.ReactNode => (
  <span
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: "calc(var(--form-line-height) * 2)",
    }}
  >
    <ColorSwatch value={value} />
    {findItemText(colorItems, value)}
  </span>
);

const renderColorHalfHeight = (value: string): React.ReactNode => (
  <span
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: "calc(var(--form-line-height) / 2)",
    }}
  >
    <ColorSwatch value={value} />
    {findItemText(colorItems, value)}
  </span>
);

const CustomRenderDemo = (args: SingleSelectProps) => {
  const [valueA, setValueA] = useState<ColorValue | null>("red");
  const [valueB, setValueB] = useState<ColorValue | null>("green");
  const [valueC, setValueC] = useState<ColorValue | null>("blue");
  const [valueD, setValueD] = useState<ColorValue | null>("orange");
  const [valueE, setValueE] = useState<ColorValue | null>("red");
  const [valueF, setValueF] = useState<ColorValue | null>("green");
  const [nakedPlain, setNakedPlain] = useState<string | null | undefined>(
    "apple",
  );
  const [nakedStyled, setNakedStyled] = useState<string | null | undefined>(
    "banana",
  );
  const [nakedValues, setNakedValues] = useState<string[]>(["apple", "cherry"]);
  const spreadArgs = args as Omit<
    SingleSelectProps,
    "items" | "value" | "onChange" | "required" | "clearable"
  >;

  return (
    <div className={sectionStyle}>
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
        <span style={subheadingStyle}>
          renderItem + renderSelectedItem (same renderer)
        </span>
        <span style={subheadingStyle}>
          renderItem (with swatch) + renderSelectedItem (bold label)
        </span>
        <Select
          {...spreadArgs}
          items={colorItems}
          value={valueA}
          onChange={(next) => {
            // Compile-time narrowing proof — fails if TValue widens to
            // `string`, or if onChange's argument widens past `null`.
            const narrowed: ColorValue | null = next;
            setValueA(narrowed);
          }}
          renderItem={renderColorItem}
          renderSelectedItem={renderColorItem}
        />
        <Select
          {...spreadArgs}
          items={colorItems}
          value={valueB}
          onChange={setValueB}
          renderItem={renderColorItem}
          renderSelectedItem={renderColorSelected}
        />
        <span style={subheadingStyle}>renderSelectedItem (2× height)</span>
        <span style={subheadingStyle}>renderSelectedItem (½× height)</span>
        <Select
          {...spreadArgs}
          items={colorItems}
          value={valueC}
          onChange={setValueC}
          renderItem={renderColorItem}
          renderSelectedItem={renderColorDoubleHeight}
        />
        <Select
          {...spreadArgs}
          items={colorItems}
          value={valueD}
          onChange={setValueD}
          renderItem={renderColorItem}
          renderSelectedItem={renderColorHalfHeight}
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>
          Connected: ½× left + 2× right - large connected items are clamped
        </span>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <Select
            {...spreadArgs}
            items={colorItems}
            value={valueE}
            onChange={setValueE}
            renderItem={renderColorItem}
            renderSelectedItem={renderColorHalfHeight}
            connectToRightInput
          />
          <Select
            {...spreadArgs}
            items={colorItems}
            value={valueF}
            onChange={setValueF}
            renderItem={renderColorItem}
            renderSelectedItem={renderColorDoubleHeight}
            connectToLeftInput
          />
        </div>
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>
          Readonly with custom renderSelectedItem (bold label)
        </span>
        <Select
          {...spreadArgs}
          items={colorItems}
          value="red"
          onChange={noop}
          renderItem={renderColorItem}
          renderSelectedItem={renderColorSelected}
          readonly
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>
          variant="naked" — no input chrome; the host supplies any hover/focus
          affordance
        </span>
        <Select
          variant="naked"
          width="fitContent"
          items={sampleItems}
          value={nakedPlain}
          onChange={setNakedPlain}
          aria-label="Fruit (naked)"
        />
        <span style={subheadingStyle}>
          variant="naked" inherits the surrounding text styles regardless of
          `size`, which still sizes the dropdown list
        </span>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            fontStyle: "italic",
            color: "#3b4a6b",
          }}
        >
          I would like{" "}
          <Select
            variant="naked"
            width="fitContent"
            size="md"
            items={sampleItems}
            value={nakedStyled}
            onChange={setNakedStyled}
            aria-label="Fruit"
          />
        </span>
        <span style={{ fontSize: 11, color: "#667788" }}>
          size=lg inside 11px text still inherits:{" "}
          <Select
            variant="naked"
            width="fitContent"
            size="lg"
            multiple
            items={sampleItems}
            value={nakedValues}
            onChange={setNakedValues}
            aria-label="Fruits"
          />
        </span>
      </div>
      <div style={{ display: "none" }}>
        <Select
          items={colorItems}
          // @ts-expect-error — "yellow" is not a value declared in colorItems
          value="yellow"
          onChange={noop}
        />
      </div>
    </div>
  );
};

export const Widths: Story = {
  render: (args: SingleSelectProps) => (
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
  ),
};

// A required select opts into clearing with `clearable`. It stays required:
// once cleared it is empty, so this example passes `invalid` to show that.
const RequiredClearableSelect = ({ size }: { size: FormInputSize }) => {
  const [value, setValue] = useState<string | null | undefined>("apple");
  return (
    <Select
      items={sampleItems}
      size={size}
      width="md"
      required
      clearable
      invalid={value == null}
      placeholder="Pick a fruit…"
      value={value}
      onChange={setValue}
    />
  );
};

export const RequiredClearable: Story = {
  render: () => (
    <div className={sectionStyle}>
      <div className={groupStyle}>
        <h3 style={headingStyle}>Required + clearable</h3>
        {formInputSizes.map((size) => (
          <Fragment key={size}>
            <span style={subheadingStyle}>{size}</span>
            <RequiredClearableSelect size={size} />
          </Fragment>
        ))}
      </div>
    </div>
  ),
};

export const CustomRender: Story = {
  render: (args: SingleSelectProps) => <CustomRenderDemo {...args} />,
};

export const Connected: Story = {
  render: (args: Partial<SingleSelectProps>) => (
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
                {...args}
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
            <ConnectedPair {...args} size={size} left={{}} right={{}} />
          </Fragment>
        ))}
      </div>
    </div>
  ),
};
