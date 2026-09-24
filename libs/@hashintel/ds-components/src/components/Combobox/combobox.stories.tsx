import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Button } from "../Button/button";
import { Dialog } from "../Dialog/dialog";
import { Combobox } from "./combobox";

import type { ItemOrGroup } from "../../util/SelectableList/selectable-list";
import type { ComboboxItem, ComboboxProps } from "./combobox";
import type { Story, StoryDefault } from "@ladle/react";

// Every example's items: ungrouped fruits, a labelled group, and a group of
// stateful options labelled after their state. The fruits and vegetables
// keep the highlight default; the custom-render item is drawn by
// renderSampleItem.
const sampleItems: Array<ItemOrGroup<ComboboxItem>> = [
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
      { value: "tick-item", text: "Tick item", selectedStyle: "tick" },
      {
        value: "checkbox-item",
        text: "Checkbox item",
        selectedStyle: "checkbox",
      },
      { value: "disabled-item", text: "Disabled item", disabled: true },
      { value: "custom-render-item", text: "Custom render item" },
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

const colorItems: ComboboxItem[] = [
  { value: "red", text: "Red" },
  { value: "green", text: "Green" },
  { value: "blue", text: "Blue" },
  { value: "orange", text: "Orange" },
];

const findColorText = (value: string): string =>
  colorItems.find((option) => option.value === value)?.text ?? value;

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
    {findColorText(value)}
  </span>
);

const renderColorSelected = (value: string): React.ReactNode => (
  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <ColorSwatch value={value} />
    <span style={{ fontWeight: 600 }}>{findColorText(value)}</span>
  </span>
);

const renderNoMatchMessage = (input: string): React.ReactNode => (
  <span>
    No fruit called <strong>“{input}”</strong>
  </span>
);

// The TextInput kitchen sink: clearable + prefix + suffix + loading
const kitchenSinkProps = {
  clearable: true,
  loading: true,
  prefix: { iconName: "search" },
  suffix: { text: "kg" },
} satisfies Partial<ComboboxProps>;

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

const Controlled = ({
  value: initialValue,
  ...props
}: Omit<ComboboxProps, "value" | "onChange"> & { value?: string }) => {
  const [value, setValue] = useState<string>(initialValue ?? "");
  return (
    <Combobox
      items={sampleItems}
      renderItem={renderSampleItem}
      {...props}
      value={value}
      onChange={setValue}
    />
  );
};

const DialogExample = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      {open ? (
        <Dialog onClose={() => setOpen(false)}>
          <Dialog.Body>
            <Controlled placeholder="Pick a fruit…" />
          </Dialog.Body>
        </Dialog>
      ) : null}
    </>
  );
};

export default {
  title: "Components / Combobox",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div className={sectionStyle}>
    <div className={groupStyle}>
      <h3 style={headingStyle}>No value</h3>
      <Controlled placeholder="Pick a fruit…" />
      <h3 style={headingStyle}>Value</h3>
      <Controlled value="banana" />
      <h3 style={headingStyle}>Disabled</h3>
      <Controlled value="banana" disabled />
      <h3 style={headingStyle}>Invalid</h3>
      <Controlled value="banana" invalid />
      <h3 style={headingStyle}>Kitchen sink</h3>
      <Controlled value="banana" {...kitchenSinkProps} />
      <h3 style={headingStyle}>Readonly (kitchen sink)</h3>
      <Controlled value="banana" {...kitchenSinkProps} readonly />
      <h3 style={headingStyle}>Subtle (kitchen sink)</h3>
      <Controlled value="banana" {...kitchenSinkProps} variant="subtle" />
      <h3 style={headingStyle}>Custom render</h3>
      <Controlled
        value="red"
        items={colorItems}
        renderItem={renderColorItem}
        renderSelectedItem={renderColorSelected}
      />
      <h3 style={headingStyle}>No items</h3>
      <Controlled items={[]} placeholder="Nothing to pick…" />
      <h3 style={headingStyle}>Custom no-match message</h3>
      <Controlled
        placeholder="Try “xyz”…"
        noMatchMessage={renderNoMatchMessage}
      />
    </div>

    <div className={groupStyle} style={{ maxWidth: "none" }}>
      <h3 style={headingStyle}>Allow new value</h3>
      <div className={rowStyle}>
        <div className={cellStyle}>
          <span style={subheadingStyle}>Enabled</span>
          <Controlled allowNewValue placeholder="Type anything…" />
        </div>
        <div className={cellStyle}>
          <span style={subheadingStyle}>Always show option</span>
          <Controlled
            allowNewValue={{ alwaysShowOption: true }}
            placeholder="Type anything…"
          />
        </div>
        <div className={cellStyle}>
          <span style={subheadingStyle}>Custom render</span>
          <Controlled
            allowNewValue={{
              renderOption: (input) => <em>Create tag “{input}”</em>,
            }}
            placeholder="Type a new tag…"
          />
        </div>
      </div>
    </div>

    <div className={groupStyle} style={{ maxWidth: "none" }}>
      <h3 style={headingStyle}>Filter algorithms</h3>
      <div className={rowStyle}>
        <div className={cellStyle}>
          <span style={subheadingStyle}>contains (default)</span>
          <Controlled placeholder="Try “an”…" />
        </div>
        <div className={cellStyle}>
          <span style={subheadingStyle}>startsWith</span>
          <Controlled filterAlgorithm="startsWith" placeholder="Try “ba”…" />
        </div>
        <div className={cellStyle}>
          <span style={subheadingStyle}>none (consumer-filtered)</span>
          <Controlled filterAlgorithm="none" placeholder="Never filters" />
        </div>
        <div className={cellStyle}>
          <span style={subheadingStyle}>custom (matches value)</span>
          <Controlled
            filterAlgorithm={(input, _text, optionValue) =>
              optionValue.includes(input.toLowerCase())
            }
            placeholder="Filters against the value"
          />
        </div>
      </div>
    </div>

    <div className={groupStyle}>
      <h3 style={headingStyle}>Inside a dialog and autofocused</h3>
      <div>
        <DialogExample />
      </div>
    </div>
  </div>
);

export const Sizes: Story = () => (
  <div className={sectionStyle}>
    <div className={groupStyle}>
      {formInputSizes.map((size) => (
        <div key={size}>
          <h3 style={headingStyle}>{size}</h3>
          <Controlled
            value="banana"
            size={size}
            allowNewValue
            {...kitchenSinkProps}
          />
        </div>
      ))}
    </div>
  </div>
);
