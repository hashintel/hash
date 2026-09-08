import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Select } from "./select";

import type { FormInputWidth } from "../../util/form-shared";
import type { ItemOrGroup } from "../Menu/SelectableList/selectable-list";
import type { MultiSelectItem, SelectItem } from "./select";
import type { Story, StoryDefault } from "@ladle/react";

type SelectProps = React.ComponentProps<typeof Select>;
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
} satisfies StoryDefault<MultiSelectProps>;

const sampleItems: Array<ItemOrGroup<SelectItem>> = [
  { value: "apple", text: "Apple" },
  { value: "banana", text: "Banana" },
  { value: "cherry", text: "Cherry" },
  { value: "date", text: "Date" },
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

const subheadingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#666",
};

// Declared `as const` so a `Select` using these items can narrow `value` /
// `onChange` to the literal union of these values.
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

const multiItemVariants = ["checkbox", "tick", "highlight"] as const;

const tonedItems = [
  { value: "neutral", text: "Neutral (default)" },
  { value: "brand", text: "Brand", tone: "brand" as const },
  { value: "error", text: "Error", tone: "error" as const },
];

const groupedItems: Array<ItemOrGroup<MultiSelectItem>> = [
  {
    id: "group-one",
    label: "Group one",
    items: [
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

const suffixItems: Array<MultiSelectItem> = [
  { value: "apple", text: "Apple", suffix: "52 kcal", showOnlyButton: true },
  {
    value: "banana",
    text: "Banana",
    suffix: "89 kcal",
    showOnlyButton: true,
    tone: "brand",
  },
  { value: "cherry", text: "Cherry", showOnlyButton: true },
  { value: "date", text: "Date", suffix: "282 kcal" },
];

export const Multiple: Story<MultiSelectProps> = (args) => {
  const spreadArgs = args as Omit<
    MultiSelectProps,
    "items" | "value" | "onChange" | "required"
  >;
  const [fruits, setFruits] = useState<string[]>(["apple", "banana"]);
  const [byVariant, setByVariant] = useState<Record<string, string[]>>({
    checkbox: ["apple"],
    tick: ["apple"],
    highlight: ["apple"],
  });
  const [tonedByVariant, setTonedByVariant] = useState<
    Record<string, string[]>
  >({
    checkbox: ["neutral", "brand", "error"],
    tick: ["neutral", "brand", "error"],
    highlight: ["neutral", "brand", "error"],
  });
  const [capped, setCapped] = useState<string[]>(["apple", "banana"]);
  const [groupedValues, setGroupedValues] = useState<string[]>([
    "apple",
    "cherry",
  ]);
  const [suffixValues, setSuffixValues] = useState<string[]>([
    "apple",
    "banana",
  ]);
  const [colors, setColors] = useState<ColorValue[]>(["red", "blue"]);
  const [clearableValues, setClearableValues] = useState<string[]>(["cherry"]);
  const [searchableValues, setSearchableValues] = useState<string[]>(["apple"]);
  const [lastSearch, setLastSearch] = useState("");

  return (
    <div className={sectionStyle}>
      <div className={groupStyle}>
        <span style={subheadingStyle}>Default (checkbox items)</span>
        <Select
          {...spreadArgs}
          multiple
          items={sampleItems}
          value={fruits}
          onChange={setFruits}
          placeholder="Select fruits..."
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>Item groups</span>
        <Select
          {...spreadArgs}
          multiple
          items={groupedItems}
          value={groupedValues}
          onChange={setGroupedValues}
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>Item variants</span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            columnGap: 32,
            rowGap: 12,
            alignItems: "center",
          }}
        >
          {multiItemVariants.map((itemVariant) => (
            <span key={itemVariant} style={subheadingStyle}>
              {itemVariant}
            </span>
          ))}
          {multiItemVariants.map((itemVariant) => (
            <Select
              key={itemVariant}
              {...spreadArgs}
              multiple
              items={sampleItems.map((item) => ({
                ...item,
                variant: itemVariant,
              }))}
              value={byVariant[itemVariant] ?? []}
              onChange={(next) =>
                setByVariant((prev) => ({ ...prev, [itemVariant]: next }))
              }
            />
          ))}
        </div>
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>Item tones (mapped to selectedTone)</span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            columnGap: 32,
            rowGap: 12,
            alignItems: "center",
          }}
        >
          {multiItemVariants.map((itemVariant) => (
            <span key={itemVariant} style={subheadingStyle}>
              {itemVariant}
            </span>
          ))}
          {multiItemVariants.map((itemVariant) => (
            <Select
              key={itemVariant}
              {...spreadArgs}
              multiple
              items={tonedItems.map((item) => ({
                ...item,
                variant: itemVariant,
              }))}
              value={tonedByVariant[itemVariant] ?? []}
              onChange={(next) =>
                setTonedByVariant((prev) => ({ ...prev, [itemVariant]: next }))
              }
            />
          ))}
        </div>
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>
          suffix + showOnlyButton — hover a row: "Only" replaces the suffix
          (Date has a suffix but no Only button)
        </span>
        <Select
          {...spreadArgs}
          multiple
          items={suffixItems}
          value={suffixValues}
          onChange={setSuffixValues}
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>
          maxItems=2 + searchable — unselected items disable once 2 values are
          selected
        </span>
        <Select
          {...spreadArgs}
          multiple
          maxItems={2}
          searchable={{ searchable: true, onSearch: noop }}
          items={sampleItems}
          value={capped}
          onChange={setCapped}
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>
          renderItem + renderSelectedItem (receives all selected values)
        </span>
        <Select
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
          renderSelectedItem={(values) => (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {values.map((val) => (
                <ColorSwatch key={val} value={val} />
              ))}
              {values.length} selected
            </span>
          )}
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>
          Searchable — onSearch reported: "{lastSearch}"
        </span>
        <Select
          {...spreadArgs}
          multiple
          searchable={{ searchable: true, onSearch: setLastSearch }}
          items={sampleItems}
          value={searchableValues}
          onChange={setSearchableValues}
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>Clearable</span>
        <Select
          {...spreadArgs}
          multiple
          items={sampleItems}
          value={clearableValues}
          onChange={setClearableValues}
          clearable={{ clearable: true, onClear: () => setClearableValues([]) }}
        />
      </div>
      <div className={groupStyle}>
        <span style={subheadingStyle}>Readonly</span>
        <Select
          {...spreadArgs}
          multiple
          items={sampleItems}
          value={["apple", "cherry"]}
          onChange={noop}
          readonly
        />
      </div>
      <div style={{ display: "none" }}>
        {/* @ts-expect-error — maxItems is only allowed when multiple is set */}
        <Select
          items={sampleItems}
          value="apple"
          onChange={noop}
          maxItems={2}
        />
        <Select
          multiple
          items={colorItems}
          // @ts-expect-error — "yellow" is not a value declared in colorItems
          value={["yellow"]}
          onChange={noop}
        />
      </div>
    </div>
  );
};
