import { useState } from "react";

import { formInputSizes } from "../../util/form-shared";
import { Filter, type FilterOperator } from "./filter";
import { FilterGroup } from "./filter-group";

import type { ItemOrGroup } from "../../util/SelectableList/selectable-list";
import type { MultiSelectItem, SelectItem } from "../Select/select";
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

type Status = "todo" | "inProgress" | "done";

type SelectValues = {
  is: Status;
  isAnyOf: string[];
  hasAllOf: string[];
  assignedTo: string;
  became: [Status, number];
  milestone: string;
};

const statusItems: Array<ItemOrGroup<SelectItem<Status>>> = [
  { value: "todo", text: "To do" },
  { value: "inProgress", text: "In progress" },
  { value: "done", text: "Done" },
];

const milestoneItems: Array<ItemOrGroup<SelectItem<string>>> = [
  {
    value: "q3-multiplayer",
    text: "Q3 2026 — Multiplayer canvas general availability (US and EU rollout)",
  },
  {
    value: "q4-automation",
    text: "Q4 2026 — Workflow automation and integration platform launch",
  },
];

const tagItems: Array<ItemOrGroup<MultiSelectItem<string>>> = [
  { value: "bug", text: "Bug" },
  { value: "feature", text: "Feature" },
  { value: "docs", text: "Docs" },
  { value: "infra", text: "Infra" },
  { value: "design", text: "Design" },
];

const loadTags = () =>
  new Promise<Array<ItemOrGroup<MultiSelectItem<string>>>>((resolve) => {
    setTimeout(() => {
      resolve(tagItems);
    }, 1500);
  });

const loadAssignees = () =>
  new Promise<Array<ItemOrGroup<SelectItem<string>>>>((resolve) => {
    setTimeout(() => {
      resolve([
        { value: "alex", text: "Alex" },
        { value: "jamie", text: "Jamie" },
        { value: "sam", text: "Sam" },
        { value: "robin", text: "Robin" },
      ]);
    }, 1500);
  });

const SelectOperators: Array<ItemOrGroup<FilterOperator<SelectValues>>> = [
  {
    key: "is",
    label: "is",
    input: { type: "select", items: statusItems },
  },
  {
    key: "isAnyOf",
    label: "is any of",
    input: {
      type: "select",
      multiple: true,
      items: tagItems,
      placeholder: "Tags…",
      searchable: true,
    },
  },
  {
    key: "hasAllOf",
    label: "has all of",
    input: {
      type: "select",
      multiple: true,
      // Async so the summary demonstrates the loading state: the committed
      // names (or "X selected") show until the option total is known.
      items: loadTags,
      placeholder: "Tags…",
      overflow: "summary",
    },
  },
  {
    key: "assignedTo",
    label: "is assigned to (async items)",
    input: {
      type: "select",
      items: loadAssignees,
      placeholder: "Anyone",
      searchable: true,
    },
  },
  {
    key: "became",
    label: "became",
    input: [
      { type: "select", items: statusItems },
      "within",
      { type: "int", min: 1, placeholder: "days" },
    ],
  },
  {
    key: "milestone",
    label: "is part of",
    input: { type: "select", items: milestoneItems },
  },
];

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
      removeable={{ onRemove: noop }}
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
      removeable={{ onRemove: noop }}
    />
    <span style={stateLabelStyle}>single operator, with value</span>
    <Filter<SingleOperatorValues>
      property="name"
      propertyLabel="Name"
      operators={SingleOperatorOperators}
      value={{ key: "contains", value: "hello" }}
      onChange={noop}
      removeable={{ onRemove: noop }}
    />
    <span style={stateLabelStyle}>no operators</span>
    <Filter<Record<string, never>>
      property="archived"
      propertyLabel="Archived"
      operators={[]}
      onChange={noop}
      removeable={{ onRemove: noop }}
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
        removeable={{ onRemove: noop }}
      />
    </div>
    <KitchenSinkState
      label="not removeable"
      value={{ key: "equals", value: "fixed filter" }}
      removeable={false}
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

const SelectState = ({
  label,
  ...filterProps
}: { label: string } & Partial<
  React.ComponentProps<typeof Filter<SelectValues>>
>) => (
  <>
    <span style={stateLabelStyle}>{label}</span>
    <Filter<SelectValues>
      property="status"
      propertyLabel="Status"
      operators={SelectOperators}
      onChange={noop}
      removeable={{ onRemove: noop }}
      {...filterProps}
    />
  </>
);

export const Selects: Story = () => (
  <div style={columnStyle}>
    <span style={stateLabelStyle}>
      empty — single, multi (searchable), async and tuple select operators
    </span>
    <Demo<SelectValues>
      property="status"
      propertyLabel="Status"
      operators={SelectOperators}
    />
    <SelectState
      label="single select with value"
      value={{ key: "is", value: "inProgress" }}
    />
    <SelectState
      label="single select, no value"
      value={{ key: "is", value: null }}
    />
    <SelectState
      label="multi select with values"
      value={{ key: "isAnyOf", value: ["bug", "docs"] }}
    />
    <SelectState
      label='multi select, overflow="summary" — every option selected renders "any"'
      value={{
        key: "hasAllOf",
        value: ["bug", "feature", "docs", "infra", "design"],
      }}
    />
    <span style={stateLabelStyle}>
      multi select, overflow=&quot;summary&quot; in a max-width container —
      names fall back to &quot;x of y&quot; once they no longer fit
    </span>
    <div style={maxWidthContainerStyle}>
      <Filter<SelectValues>
        property="status"
        propertyLabel="Status"
        operators={SelectOperators}
        value={{ key: "hasAllOf", value: ["bug", "feature", "docs", "infra"] }}
        onChange={noop}
        removeable={{ onRemove: noop }}
      />
    </div>
    <SelectState
      label="async items (1.5s), searchable — the committed value shows while options load"
      value={{ key: "assignedTo", value: "alex" }}
    />
    <SelectState
      label="select in a tuple with a number input"
      value={{ key: "became", value: ["done", 7] }}
    />
    <SelectState
      label="single select with a long value — the chip caps at 32ch and the value ellipsifies"
      value={{ key: "milestone", value: "q3-multiplayer" }}
    />
    <SelectState
      label="disabled"
      value={{ key: "is", value: "done" }}
      disabled
    />
  </div>
);

type GroupEntry = { id: number; propertyLabel: string } & (
  | { operators: "kitchenSink"; value: FilterValue<KitchenSinkValues> | null }
  | { operators: "select"; value: FilterValue<SelectValues> | null }
);

const groupProperties: Array<
  Pick<GroupEntry, "propertyLabel"> & { operators: GroupEntry["operators"] }
> = [
  { propertyLabel: "Name", operators: "kitchenSink" },
  { propertyLabel: "Age", operators: "kitchenSink" },
  { propertyLabel: "Status", operators: "select" },
  { propertyLabel: "Score", operators: "kitchenSink" },
  { propertyLabel: "Tags", operators: "select" },
];

const groupContainerStyle: React.CSSProperties = {
  maxWidth: 560,
  padding: 8,
  border: "1px dashed #ccc",
  borderRadius: 6,
};

/** Stateful harness: filters can be added, edited, removed and cleared. */
const GroupDemo = ({
  dismissAbandoned = false,
}: {
  /** Passed through to each chip's `removeable` config. */
  dismissAbandoned?: boolean;
}) => {
  const [filters, setFilters] = useState<GroupEntry[]>([
    {
      id: 1,
      propertyLabel: "Name",
      operators: "kitchenSink",
      value: { key: "contains", value: "alexander" },
    },
    {
      id: 2,
      propertyLabel: "Status",
      operators: "select",
      value: { key: "is", value: "inProgress" },
    },
    {
      id: 3,
      propertyLabel: "Age",
      operators: "kitchenSink",
      value: { key: "between", value: [18, 45, 65] },
    },
    {
      id: 4,
      propertyLabel: "Tags",
      operators: "select",
      value: { key: "isAnyOf", value: ["bug", "docs"] },
    },
    {
      id: 5,
      propertyLabel: "Active",
      operators: "kitchenSink",
      value: { key: "true", value: null },
    },
  ]);

  const addFilter = () => {
    setFilters((previous) => {
      const id = Math.max(0, ...previous.map((entry) => entry.id)) + 1;
      const template = groupProperties[(id - 1) % groupProperties.length] ?? {
        propertyLabel: "Value",
        operators: "kitchenSink" as const,
      };
      return [...previous, { id, ...template, value: null }];
    });
  };

  const removeFilter = (id: number) => {
    setFilters((previous) => previous.filter((entry) => entry.id !== id));
  };

  return (
    <div style={groupContainerStyle}>
      <FilterGroup>
        {filters.map((filter) =>
          filter.operators === "select" ? (
            <Filter<SelectValues>
              key={filter.id}
              property={`property-${filter.id}`}
              propertyLabel={filter.propertyLabel}
              operators={SelectOperators}
              value={filter.value}
              onChange={(...change: FilterChange<SelectValues>) => {
                const [key, nextValue] = change;
                const value = {
                  key,
                  value: nextValue,
                } as FilterValue<SelectValues>;
                setFilters((previous) =>
                  previous.map((entry) =>
                    entry.id === filter.id ? { ...filter, value } : entry,
                  ),
                );
              }}
              removeable={{
                onRemove: () => removeFilter(filter.id),
                dismissAbandoned,
              }}
            />
          ) : (
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
                    entry.id === filter.id ? { ...filter, value } : entry,
                  ),
                );
              }}
              removeable={{
                onRemove: () => removeFilter(filter.id),
                dismissAbandoned,
              }}
            />
          ),
        )}
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
    <span style={stateLabelStyle}>
      dismissAbandoned: every chip below sets `removeable.dismissAbandoned`.
      Leave a chip incomplete — no operator, or any input empty (including
      emptying an input of one of the pre-filled chips) — then click or focus
      elsewhere: after 3s it fades out over 3s and removes itself. Interacting
      with it — including its dropdowns — rescues it. Complete chips and
      input-less ones (&quot;is true&quot;) are never dismissed.
    </span>
    <GroupDemo dismissAbandoned />
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
          removeable={{ onRemove: noop }}
        />
      </div>
    ))}
  </div>
);
