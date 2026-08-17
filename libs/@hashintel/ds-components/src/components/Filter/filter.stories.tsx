import { useState } from "react";

import { formInputSizes } from "../../util/form-shared";
import { Filter, type FilterOperator } from "./filter";

import type { ItemOrGroup } from "../Menu/SelectableList/selectable-list";
import type { FilterChange, FilterValue } from "./filter-util";
import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Filter",
} satisfies StoryDefault;

type KitchenSinkValues = {
  equals: string;
  matches: string;
  contains: string;
  equalsNum: number;
  gt: number;
  power: number;
  true: null;
  false: null;
  between: [number, number];
  outside: [number, number];
  near: [number, number];
};

const KitchenSinkOperators: Array<
  ItemOrGroup<FilterOperator<KitchenSinkValues>>
> = [
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
        key: "matches",
        label: "matches",
        input: { type: "string", placeholder: "Regex", pattern: "/.*/" },
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
    ],
  },
  {
    id: "boolean",
    label: "Boolean",
    items: [
      { key: "true", label: "is true", input: null },
      { key: "false", label: "is false", input: null },
    ],
  },
  {
    id: "range",
    label: "Range",
    items: [
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
      {
        key: "near",
        label: "is near",
        input: [
          { type: "float", min: -90, max: 90, placeholder: "Lat" },
          { type: "float", min: -180, max: 180, placeholder: "Lng" },
        ],
        tooltip: "Latitude, longitude",
      },
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

const stateLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#999",
  marginTop: 8,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Filter<ValueMap>
        removeable={{
          removeable: true,
          onRemove: () => {
            setValue(null);
            setChanges((previous) => [...previous.slice(-4), "onRemove()"]);
          },
        }}
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

const KitchenSinkState = ({
  label,
  ...filterProps
}: { label: string } & Partial<
  React.ComponentProps<typeof Filter<KitchenSinkValues>>
>) => (
  <>
    <span style={stateLabelStyle}>{label}</span>
    <Filter<KitchenSinkValues>
      property="value"
      propertyLabel="Value"
      operators={KitchenSinkOperators}
      onChange={noop}
      removeable={{ removeable: true, onRemove: noop }}
      {...filterProps}
    />
  </>
);

export const Default: Story = () => (
  <div style={columnStyle}>
    <span style={stateLabelStyle}>empty</span>
    <Demo<KitchenSinkValues>
      property="value"
      propertyLabel="Value"
      operators={KitchenSinkOperators}
    />
    <KitchenSinkState
      label="operator selected, no value"
      value={{ key: "contains", value: null }}
    />
    <KitchenSinkState
      label="operator and value entered"
      value={{ key: "contains", value: "hello" }}
    />
    <KitchenSinkState
      label="range operator, no values"
      value={{ key: "between", value: null }}
    />
    <KitchenSinkState
      label="range operator, both values"
      value={{ key: "between", value: [10, 50] }}
    />
    <KitchenSinkState
      label="two inputs, no separator"
      value={{ key: "near", value: [51.5074, -0.1278] }}
    />
    <KitchenSinkState
      label="not removeable"
      value={{ key: "equals", value: "fixed filter" }}
      removeable={{ removeable: false, onRemove: noop }}
    />
    <KitchenSinkState
      label="disabled"
      value={{ key: "gt", value: 42 }}
      disabled
    />
    <KitchenSinkState
      label="with error"
      value={{ key: "gt", value: 420 }}
      errors={["Value must be less than 100"]}
    />
  </div>
);

export const Sizes: Story = () => (
  <div style={columnStyle}>
    {formInputSizes.map((size) => (
      <div key={size} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 32, fontSize: 12, color: "#999" }}>{size}</span>
        <Filter<KitchenSinkValues>
          property="value"
          propertyLabel="Value"
          operators={KitchenSinkOperators}
          value={{ key: "between", value: [10, 50] }}
          onChange={noop}
          size={size}
          removeable={{ removeable: true, onRemove: noop }}
        />
      </div>
    ))}
  </div>
);
