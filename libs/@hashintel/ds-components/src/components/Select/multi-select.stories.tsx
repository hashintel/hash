import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { Select } from "./select";

import type { ItemOrGroup } from "../Menu/SelectableList/selectable-list";
import type { SelectItem } from "./select";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Select",
} satisfies StoryDefault;

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

export const Multiple: Story = () => {
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
  const [colors, setColors] = useState<ColorValue[]>(["red", "blue"]);
  const [clearableValues, setClearableValues] = useState<string[]>(["cherry"]);

  return (
    <div className={sectionStyle}>
      <div className={groupStyle}>
        <span style={subheadingStyle}>Default (checkbox items)</span>
        <Select
          multiple
          items={sampleItems}
          value={fruits}
          onChange={setFruits}
          placeholder="Select fruits..."
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
          maxItems=2 — unselected items disable once 2 values are selected
        </span>
        <Select
          multiple
          maxItems={2}
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
        <span style={subheadingStyle}>Clearable</span>
        <Select
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
