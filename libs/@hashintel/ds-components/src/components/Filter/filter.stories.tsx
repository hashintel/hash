import { useState } from "react";

import { formInputSizes } from "../../util/form-shared";
import { Filter, type FilterOperator } from "./filter";
import { FilterGroup } from "./filter-group";

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
  lt: number;
  true: null;
  false: null;
  between: [number, number, number];
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
      },
      {
        key: "matches",
        label: "matches",
        input: { type: "string", placeholder: "Regex", pattern: "/.*/" },
      },
      {
        key: "contains",
        label: "contains (min 5, max 10)",
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
      },
      {
        key: "gt",
        label: "greater than (float, min 0, max 99999)",
        input: { type: "float", min: 0, max: 99999, placeholder: "Float" },
      },
      {
        key: "lt",
        label: "less than (int, step 10)",
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
          { iconName: "arrowRight" },
          { type: "int", min: 0, max: 100 },
        ],
      },
      {
        key: "near",
        label: "is near (float)",
        input: [
          { type: "float", min: -90, max: 90, placeholder: "Lat" },
          { type: "float", min: -180, max: 180, placeholder: "Lng" },
        ],
      },
    ],
  },
];

type LongContentValues = {
  alphabeticallyBetween: [string, string];
};

const LongContentOperators: Array<
  ItemOrGroup<FilterOperator<LongContentValues>>
> = [
  {
    key: "alphabeticallyBetween",
    label: "is somewhere alphabetically between",
    input: [{ type: "string" }, "and", { type: "string" }],
  },
];

type SingleOperatorValues = {
  contains: string;
};

const SingleOperatorOperators: Array<
  ItemOrGroup<FilterOperator<SingleOperatorValues>>
> = [{ key: "contains", label: "contains", input: { type: "string" } }];

const noop = () => {};

const maxWidthContainerStyle: React.CSSProperties = {
  maxWidth: 320,
  padding: 8,
  border: "1px dashed #ccc",
  borderRadius: 6,
};

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
          setValue({ key, value: nextValue } as FilterValue<ValueMap>);
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
      label="range operator, all values"
      value={{ key: "between", value: [10, 50, 90] }}
    />
    <KitchenSinkState
      label="two inputs, no separator"
      value={{ key: "near", value: [51.5074, -0.1278] }}
    />
    <span style={stateLabelStyle}>single operator, no value</span>
    <Filter<SingleOperatorValues>
      property="name"
      propertyLabel="Name"
      operators={SingleOperatorOperators}
      value={null}
      onChange={noop}
      removeable={{ removeable: true, onRemove: noop }}
    />
    <span style={stateLabelStyle}>single operator, with value</span>
    <Filter<SingleOperatorValues>
      property="name"
      propertyLabel="Name"
      operators={SingleOperatorOperators}
      value={{ key: "contains", value: "hello" }}
      onChange={noop}
      removeable={{ removeable: true, onRemove: noop }}
    />
    <span style={stateLabelStyle}>no operators</span>
    <Filter<Record<string, never>>
      property="archived"
      propertyLabel="Archived"
      operators={[]}
      onChange={noop}
      removeable={{ removeable: true, onRemove: noop }}
    />
    <span style={stateLabelStyle}>
      responsive, long content in a max-width container
    </span>
    <div style={maxWidthContainerStyle}>
      <Filter<LongContentValues>
        property="contactEmail"
        propertyLabel="Organization primary contact email address"
        operators={LongContentOperators}
        value={{
          key: "alphabeticallyBetween",
          value: [
            "aaron.alderman@extremely-long-organization-domain.example.com",
            "zachariah.zimmermann@extremely-long-organization-domain.example.com",
          ],
        }}
        onChange={noop}
        removeable={{ removeable: true, onRemove: noop }}
      />
    </div>
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
    <KitchenSinkState
      label="with multiple errors"
      value={{ key: "near", value: [200.1234, -300.5678] }}
      errors={[
        "Latitude must be between -90 and 90",
        "Longitude must be between -180 and 180",
      ]}
    />
  </div>
);

type GroupEntry = {
  id: number;
  propertyLabel: string;
  value: FilterValue<KitchenSinkValues> | null;
};

const groupProperties = ["Name", "Age", "Active", "Score", "Rating"];

const groupContainerStyle: React.CSSProperties = {
  maxWidth: 560,
  padding: 8,
  border: "1px dashed #ccc",
  borderRadius: 6,
};

/** Stateful harness: filters can be added, edited, removed and cleared. */
const GroupDemo = () => {
  const [filters, setFilters] = useState<GroupEntry[]>([
    {
      id: 1,
      propertyLabel: "Name",
      value: { key: "contains", value: "alexander" },
    },
    {
      id: 2,
      propertyLabel: "Age",
      value: { key: "between", value: [18, 45, 65] },
    },
    { id: 3, propertyLabel: "Active", value: { key: "true", value: null } },
  ]);

  const addFilter = () => {
    setFilters((previous) => {
      const id = Math.max(0, ...previous.map((entry) => entry.id)) + 1;
      return [
        ...previous,
        {
          id,
          propertyLabel:
            groupProperties[(id - 1) % groupProperties.length] ?? "Value",
          value: null,
        },
      ];
    });
  };

  return (
    <div style={groupContainerStyle}>
      <FilterGroup>
        {filters.map((filter) => (
          <Filter<KitchenSinkValues>
            key={filter.id}
            property={`property-${filter.id}`}
            propertyLabel={filter.propertyLabel}
            operators={KitchenSinkOperators}
            value={filter.value}
            onChange={(...change: FilterChange<KitchenSinkValues>) => {
              const [key, nextValue] = change;
              const value = {
                key,
                value: nextValue,
              } as FilterValue<KitchenSinkValues>;
              setFilters((previous) =>
                previous.map((entry) =>
                  entry.id === filter.id ? { ...entry, value } : entry,
                ),
              );
            }}
            removeable={{
              removeable: true,
              onRemove: () =>
                setFilters((previous) =>
                  previous.filter((entry) => entry.id !== filter.id),
                ),
            }}
          />
        ))}
        <FilterGroup.AddFilter onClick={addFilter} />
        <FilterGroup.ClearFilters
          disabled={filters.length === 0}
          onClick={() => setFilters([])}
        />
      </FilterGroup>
    </div>
  );
};

export const Group: Story = () => (
  <div style={columnStyle}>
    <GroupDemo />
    <span style={stateLabelStyle}>add button contents</span>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <FilterGroup.AddFilter onClick={noop} />
      <FilterGroup.AddFilter renderAs="plusLabel" onClick={noop} />
      <FilterGroup.AddFilter renderAs="filterIcon" onClick={noop} />
    </div>
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
          value={{ key: "between", value: [10, 50, 90] }}
          onChange={noop}
          size={size}
          removeable={{ removeable: true, onRemove: noop }}
        />
      </div>
    ))}
  </div>
);
