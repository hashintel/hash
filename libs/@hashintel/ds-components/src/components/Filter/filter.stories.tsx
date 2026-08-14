import { useState } from "react";

import { formInputSizes } from "../../util/form-shared";
import { Filter, type FilterOperator } from "./filter";

import type { ItemOrGroup } from "../Menu/SelectableList/selectable-list";
import type { FilterChange, FilterValue } from "./filter-util";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Filter",
} satisfies StoryDefault;

type StringFilterValues = {
  equals: string;
  matches: string;
  contains: string;
};

const StringOperators: Array<ItemOrGroup<FilterOperator<StringFilterValues>>> =
  [
    {
      key: "equals",
      label: "equals",
      input: { type: "string" },
      tooltip: "Aa case sensitive",
    },
    {
      key: "matches",
      label: "matches",
      input: { type: "string", placeholder: "Regex", pattern: "/.*/" },
    },
    {
      key: "contains",
      label: "contains",
      input: { type: "string", min: 5, max: 10 },
    },
  ];

type NumberFilterValues = {
  equalsNum: number;
  gt: number;
  power: number;
};

const NumberOperators: Array<ItemOrGroup<FilterOperator<NumberFilterValues>>> =
  [
    {
      key: "equalsNum",
      label: "equals",
      input: { type: "number" },
      tooltip: "Any number",
    },
    {
      key: "gt",
      label: "greater than",
      input: { type: "float", min: 0, max: 99999, placeholder: "Float" },
    },
    {
      key: "power",
      label: "is power of 10",
      input: { type: "int", step: 10 },
    },
  ];

type BooleanFilterValues = {
  true: null;
  false: null;
};

const BooleanOperators: Array<
  ItemOrGroup<FilterOperator<BooleanFilterValues>>
> = [
  { key: "true", label: "is true", input: null },
  { key: "false", label: "is false", input: null },
];

type RangeFilterValues = {
  between: [number, number];
  outside: [number, number];
};

const RangeOperators: Array<ItemOrGroup<FilterOperator<RangeFilterValues>>> = [
  {
    key: "between",
    label: "between",
    input: [
      { type: "int", min: 0, max: 100 },
      "-",
      { type: "int", min: 0, max: 100 },
    ],
    tooltip: "Inclusive bounds",
  },
  {
    key: "outside",
    label: "outside",
    input: [
      { type: "int", min: 0, max: 100 },
      "-",
      { type: "int", min: 0, max: 100 },
    ],
  },
];

const noop = () => {};

const columnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  alignItems: "flex-start",
  padding: 16,
};

const changeLogStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontFamily: "monospace",
  color: "#667",
};

/** Controlled harness that renders the Filter plus a log of onChange calls. */
const Demo = <ValueMap extends Record<string, unknown>>({
  initialValue = null,
  ...filterProps
}: Omit<React.ComponentProps<typeof Filter<ValueMap>>, "value" | "onChange"> & {
  initialValue?: FilterValue<ValueMap> | null;
}) => {
  const [value, setValue] = useState<FilterValue<ValueMap> | null>(
    initialValue,
  );
  const [changes, setChanges] = useState<string[]>([]);
  return (
    <div style={columnStyle}>
      <Filter<ValueMap>
        {...filterProps}
        value={value}
        onChange={(...change: FilterChange<ValueMap>) => {
          const [key, nextValue] = change;
          setValue(
            key === null
              ? null
              : ({ key, value: nextValue } as FilterValue<ValueMap>),
          );
          setChanges((previous) => [
            ...previous.slice(-4),
            `onChange(${JSON.stringify(key)}, ${JSON.stringify(nextValue)})`,
          ]);
        }}
      />
      <pre style={changeLogStyle}>
        {changes.length > 0 ? changes.join("\n") : "no onChange fired yet"}
      </pre>
    </div>
  );
};

export const Text: Story = () => (
  <Demo<StringFilterValues>
    property="name"
    propertyLabel="Name"
    operators={StringOperators}
  />
);

export const Numbers: Story = () => (
  <Demo<NumberFilterValues>
    property="age"
    propertyLabel="Age"
    operators={NumberOperators}
  />
);

export const BooleanFlags: Story = () => (
  <Demo<BooleanFilterValues>
    property="archived"
    propertyLabel="Archived"
    operators={BooleanOperators}
  />
);

export const NumberRange: Story = () => (
  <Demo<RangeFilterValues>
    property="rating"
    propertyLabel="Rating"
    operators={RangeOperators}
  />
);

type MixedFilterValues = StringFilterValues & NumberFilterValues;

const GroupedOperators: Array<ItemOrGroup<FilterOperator<MixedFilterValues>>> =
  [
    {
      id: "text",
      label: "Text",
      items: [
        {
          key: "equals",
          label: "equals",
          input: { type: "string" },
          tooltip: "Aa case sensitive",
        },
        {
          key: "contains",
          label: "contains",
          input: { type: "string", min: 5, max: 10 },
        },
      ],
    },
    {
      id: "number",
      label: "Number",
      items: [
        {
          key: "gt",
          label: "greater than",
          input: { type: "float", min: 0, max: 99999, placeholder: "Float" },
        },
        {
          key: "power",
          label: "is power of 10",
          input: { type: "int", step: 10 },
        },
      ],
    },
  ];

export const Grouped: Story = () => (
  <Demo<MixedFilterValues>
    property="value"
    propertyLabel="Value"
    operators={GroupedOperators}
  />
);

export const Sizes: Story = () => (
  <div style={columnStyle}>
    {formInputSizes.map((size) => (
      <div key={size} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 32, fontSize: 12, color: "#999" }}>{size}</span>
        <Filter<NumberFilterValues>
          property="age"
          propertyLabel="Age"
          operators={NumberOperators}
          value={{ key: "gt", value: 42 }}
          onChange={noop}
          size={size}
        />
      </div>
    ))}
  </div>
);

export const States: Story = () => (
  <div style={columnStyle}>
    <span style={{ fontSize: 12, color: "#999" }}>empty</span>
    <Filter<NumberFilterValues>
      property="age"
      propertyLabel="Age"
      operators={NumberOperators}
      onChange={noop}
    />
    <span style={{ fontSize: 12, color: "#999" }}>with value</span>
    <Filter<NumberFilterValues>
      property="age"
      propertyLabel="Age"
      operators={NumberOperators}
      value={{ key: "gt", value: 42 }}
      onChange={noop}
    />
    <span style={{ fontSize: 12, color: "#999" }}>disabled</span>
    <Filter<NumberFilterValues>
      property="age"
      propertyLabel="Age"
      operators={NumberOperators}
      value={{ key: "gt", value: 42 }}
      onChange={noop}
      disabled
    />
    <span style={{ fontSize: 12, color: "#999" }}>with errors</span>
    <Filter<NumberFilterValues>
      property="age"
      propertyLabel="Age"
      operators={NumberOperators}
      value={{ key: "gt", value: 420 }}
      onChange={noop}
      errors={["Value must be less than 100"]}
    />
  </div>
);
