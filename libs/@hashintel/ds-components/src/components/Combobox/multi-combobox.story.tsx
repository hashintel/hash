import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Combobox } from "./combobox";

import type { ItemOrGroup } from "../../util/SelectableList/selectable-list";
import type { ComboboxProps, MultiComboboxItem } from "./combobox";

// The multiple, no-new-values arm of the props union: `value`/`onChange` are
// arrays scoped to the items' values.
export type MultiComboboxProps = Extract<
  ComboboxProps,
  { multiple: true; allowNewValue?: false }
>;

type ControlledMultiProps = Omit<
  MultiComboboxProps,
  "multiple" | "value" | "onChange"
> & { value?: string[] };

// `allowNewValue` truthy switches the union to the any-string arm.
type AllowNewValue = NonNullable<
  Exclude<ComboboxProps["allowNewValue"], boolean> | true
>;

const overflowModes = ["scroll", "truncate", "summary"] as const;

const selectedStyles = ["checkbox", "tick", "highlight"] as const;
const selectedTones = ["neutral", "brand", "error"] as const;

// Every example's items: ungrouped fruits, a labelled group, a group covering
// each selectedStyle × selectedTone combination plus a disabled and a
// custom-rendered item, and a group of suffix / "Only" button examples.
const sampleItems: Array<ItemOrGroup<MultiComboboxItem>> = [
  { value: "fig", text: "Fig" },
  { value: "grape", text: "Grape" },
  { value: "apple", text: "Apple" },
  { value: "banana", text: "Banana" },
  {
    id: "vegetables",
    label: "Vegetables",
    items: [
      { value: "carrot", text: "Carrot" },
      { value: "leek", text: "Leek" },
      { value: "radish", text: "Radish" },
    ],
  },
  {
    id: "item-states",
    label: "Item states & styles",
    items: [
      ...selectedStyles.flatMap((selectedStyle) =>
        selectedTones.map((selectedTone): MultiComboboxItem => ({
          value: `${selectedStyle}-${selectedTone}`,
          text: `${selectedStyle} · ${selectedTone}`,
          selectedStyle,
          selectedTone,
        })),
      ),
      { value: "disabled-item", text: "Disabled item", disabled: true },
      { value: "custom-render-item", text: "Custom render item" },
    ],
  },
  {
    id: "suffix-only",
    label: "Suffix & Only",
    items: [
      {
        value: "cherry",
        text: "Cherry",
        suffix: "50 kcal",
        showOnlyButton: true,
      },
      {
        value: "date",
        text: "Date",
        suffix: "282 kcal",
        showOnlyButton: true,
        selectedTone: "brand",
      },
      { value: "elderberry", text: "Elderberry", showOnlyButton: true },
      { value: "honeydew", text: "Honeydew", suffix: "36 kcal" },
    ],
  },
];

const sampleItemText = (value: string): string => {
  for (const entry of sampleItems) {
    if ("items" in entry) {
      const found = entry.items.find((option) => option.value === value);
      if (found) {
        return found.text;
      }
    } else if (entry.value === value) {
      return entry.text;
    }
  }
  return value;
};

const renderSampleItem = (value: string): React.ReactNode =>
  value === "custom-render-item" ? (
    <span>
      <span style={{ marginRight: 6 }} aria-hidden="true">
        🎨
      </span>
      Custom render item
    </span>
  ) : (
    sampleItemText(value)
  );

// The TextInput kitchen sink, matching the single story's example.
const kitchenSinkProps = {
  clearable: true,
  loading: true,
  prefix: { iconName: "search" },
  suffix: { text: "kg" },
} satisfies Partial<ComboboxProps>;

// Declared `as const` so a `Combobox` using these items can narrow `value` /
// `onChange` to the literal union of these values.
const colorItems = [
  { value: "red", text: "Red" },
  { value: "green", text: "Green" },
  { value: "blue", text: "Blue" },
  { value: "orange", text: "Orange" },
] as const;

type ColorValue = (typeof colorItems)[number]["value"];

const findItemText = (
  items: ReadonlyArray<ItemOrGroup<MultiComboboxItem>>,
  value: string,
): string => {
  for (const entry of items) {
    if ("items" in entry) {
      const found = entry.items.find((item) => item.value === value);
      if (found) {
        return found.text;
      }
    } else if (entry.value === value) {
      return entry.text;
    }
  }
  return value;
};

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
  maxWidth: "[360px]",
});

const rowStyle = css({
  display: "flex",
  gap: "[12px]",
});

const cellStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  width: "[220px]",
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

const noop = () => {};

const ControlledMulti = ({
  value: initialValues,
  ...props
}: ControlledMultiProps) => {
  const [values, setValues] = useState<string[]>(initialValues ?? []);
  return (
    <Combobox
      multiple
      items={sampleItems}
      renderItem={renderSampleItem}
      {...props}
      value={values}
      onChange={setValues}
    />
  );
};

const ControlledTags = ({
  value: initialValues,
  allowNewValue = true,
  ...props
}: Omit<ControlledMultiProps, "allowNewValue"> & {
  allowNewValue?: AllowNewValue;
}) => {
  const [values, setValues] = useState<string[]>(initialValues ?? []);
  return (
    <Combobox
      multiple
      items={sampleItems}
      renderItem={renderSampleItem}
      {...props}
      allowNewValue={allowNewValue}
      value={values}
      onChange={(next) => setValues(next)}
    />
  );
};

export const MultipleDemo = (args: MultiComboboxProps) => {
  const spreadArgs = args as Omit<
    MultiComboboxProps,
    "items" | "value" | "onChange" | "allowNewValue"
  >;

  const [colors, setColors] = useState<ColorValue[]>(["red", "blue"]);
  // Compile-time narrowing proofs for the single arms (rendered hidden
  // below): the setters fail if TValue widens to `string` — or, for the
  // optional arm, if onChange's argument widens past `TValue | null` (its
  // `value` still accepts undefined in).
  const [requiredColor, setRequiredColor] = useState<ColorValue>("red");
  const [optionalColor, setOptionalColor] = useState<ColorValue | null>(null);

  return (
    <div className={sectionStyle}>
      <div className={groupStyle}>
        <h3 style={headingStyle}>No value</h3>
        <ControlledMulti {...spreadArgs} placeholder="Select fruits…" />
        <h3 style={headingStyle}>Value</h3>
        <ControlledMulti {...spreadArgs} value={["apple", "carrot"]} />
        <h3 style={headingStyle}>Disabled</h3>
        <ControlledMulti {...spreadArgs} value={["apple", "carrot"]} disabled />
        <h3 style={headingStyle}>Invalid</h3>
        <ControlledMulti {...spreadArgs} value={["apple", "carrot"]} invalid />
        <h3 style={headingStyle}>Kitchen sink</h3>
        <ControlledMulti
          {...spreadArgs}
          value={["apple", "carrot"]}
          {...kitchenSinkProps}
        />
        <h3 style={headingStyle}>Readonly (kitchen sink)</h3>
        <ControlledMulti
          {...spreadArgs}
          value={["apple", "carrot"]}
          {...kitchenSinkProps}
          readonly
        />
        <h3 style={headingStyle}>Subtle</h3>
        <ControlledMulti
          {...spreadArgs}
          value={["apple", "carrot"]}
          variant="subtle"
        />
        <h3 style={headingStyle}>maxItems = 2</h3>
        <ControlledMulti
          {...spreadArgs}
          maxItems={2}
          value={["apple", "banana"]}
        />
        <h3 style={headingStyle}>clearInputOnSelect = false</h3>
        <span style={subheadingStyle}>
          The typed filter survives toggling options (default clears it)
        </span>
        <ControlledMulti
          {...spreadArgs}
          clearInputOnSelect={false}
          value={["apple"]}
        />
      </div>

      <div className={groupStyle} style={{ maxWidth: "none" }}>
        <h3 style={headingStyle}>Custom render</h3>
        <div className={rowStyle}>
          <div className={cellStyle}>
            <span style={subheadingStyle}>renderItem (dropdown + chips)</span>
            <Combobox
              {...spreadArgs}
              multiple
              items={colorItems}
              value={colors}
              onChange={(next) => {
                // Compile-time narrowing proof — fails if TValue widens to `string`.
                const narrowed: ColorValue[] = next;
                setColors(narrowed);
              }}
              renderItem={renderColorItem}
            />
          </div>
          <div className={cellStyle}>
            <span style={subheadingStyle}>renderSelectedItem (per chip)</span>
            <Combobox
              {...spreadArgs}
              multiple
              items={colorItems}
              value={colors}
              onChange={(next) => setColors(next)}
              renderItem={renderColorItem}
              renderSelectedItem={(selectedValue) => (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ColorSwatch value={selectedValue} />
                  <span style={{ fontWeight: 600 }}>
                    {findItemText(colorItems, selectedValue)}
                  </span>
                </span>
              )}
            />
          </div>
          <div className={cellStyle}>
            <span style={subheadingStyle}>
              renderSelectedAll (receives all values)
            </span>
            <Combobox
              {...spreadArgs}
              multiple
              items={colorItems}
              value={colors}
              onChange={(next) => setColors(next)}
              renderItem={renderColorItem}
              renderSelectedAll={(values) => (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {values.map((val) => (
                    <ColorSwatch key={val} value={val} />
                  ))}
                  {values.length} selected
                </span>
              )}
            />
          </div>
        </div>
      </div>

      <div className={groupStyle} style={{ maxWidth: "none" }}>
        <h3 style={headingStyle}>Overflow</h3>
        <div className={rowStyle}>
          {overflowModes.map((mode) => (
            <div key={mode} className={cellStyle}>
              <span style={subheadingStyle}>overflow="{mode}"</span>
              <ControlledMulti
                {...spreadArgs}
                overflow={mode}
                value={["apple", "banana", "carrot", "leek", "cherry", "date"]}
                placeholder="Select fruits…"
              />
            </div>
          ))}
        </div>
      </div>

      <div className={groupStyle} style={{ maxWidth: "none" }}>
        <h3 style={headingStyle}>Allow new value</h3>
        <div className={rowStyle}>
          <div className={cellStyle}>
            <span style={subheadingStyle}>Enabled</span>
            <ControlledTags
              {...spreadArgs}
              value={["apple", "dragonfruit"]}
              placeholder="Add fruits…"
            />
          </div>
          <div className={cellStyle}>
            <span style={subheadingStyle}>Always show option</span>
            <ControlledTags
              {...spreadArgs}
              allowNewValue={{ alwaysShowOption: true }}
              placeholder="Type anything…"
            />
          </div>
          <div className={cellStyle}>
            <span style={subheadingStyle}>Custom render</span>
            <ControlledTags
              {...spreadArgs}
              allowNewValue={{
                renderOption: (input) => <em>Create tag “{input}”</em>,
              }}
              placeholder="Type a new tag…"
            />
          </div>
        </div>
      </div>

      <div style={{ display: "none" }}>
        {/* @ts-expect-error — maxItems is only allowed when multiple is set */}
        <Combobox
          items={sampleItems}
          value="apple"
          onChange={noop}
          maxItems={2}
        />
        {/* @ts-expect-error — "yellow" is not a value declared in colorItems */}
        <Combobox
          multiple
          items={colorItems}
          value={["yellow"]}
          onChange={noop}
        />
        <Combobox
          items={colorItems}
          required
          value={requiredColor}
          onChange={setRequiredColor}
        />
        <Combobox
          items={colorItems}
          value={optionalColor}
          onChange={setOptionalColor}
        />
      </div>
    </div>
  );
};
