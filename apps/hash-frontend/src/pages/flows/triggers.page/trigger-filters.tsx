import { Button, Filter, FilterGroup, Menu } from "@hashintel/ds-components";

import type { FilterOperator } from "@hashintel/ds-components";

export type TriggerFilterProperty = "flow" | "web";

type FilterOption = { value: string; text: string };

const propertyLabels: Record<TriggerFilterProperty, string> = {
  flow: "Flow",
  web: "Web",
};

const isOperators = (
  items: FilterOption[],
): FilterOperator<{ is: string }>[] => [
  {
    key: "is",
    label: "is",
    input: { type: "select", items, searchable: true },
  },
];

/** The Filter button, which adds a filter for a property not filtered on yet. */
export const AddTriggerFilter = ({
  properties,
  shown,
  appliedCount,
  onAdd,
}: {
  properties: TriggerFilterProperty[];
  shown: TriggerFilterProperty[];
  appliedCount: number;
  onAdd: (property: TriggerFilterProperty) => void;
}) => (
  <Menu
    position="bottom-end"
    items={properties.map((property) => ({
      id: property,
      text: propertyLabels[property],
      disabled: shown.includes(property),
      onClick: () => onAdd(property),
    }))}
    trigger={
      <Button size="sm" variant="ghost" tone="neutral" iconName="filter">
        {appliedCount > 0 ? `Filter · ${appliedCount}` : "Filter"}
      </Button>
    }
  />
);

/** The filters added, as chips. One left without a value is dropped once the user moves on. */
export const TriggerFilterBar = ({
  shown,
  added,
  options,
  values,
  onChange,
  onRemove,
  onClear,
}: {
  shown: TriggerFilterProperty[];
  /** The filter just added, which takes focus. */
  added: TriggerFilterProperty | null;
  options: Record<TriggerFilterProperty, FilterOption[]>;
  values: Record<TriggerFilterProperty, string | null>;
  onChange: (property: TriggerFilterProperty, value: string | null) => void;
  onRemove: (property: TriggerFilterProperty) => void;
  onClear: () => void;
}) => (
  <FilterGroup dismissAbandoned>
    {shown.map((property) => (
      <Filter<{ is: string }>
        key={property}
        property={property}
        propertyLabel={propertyLabels[property]}
        operators={isOperators(options[property])}
        value={{ key: "is", value: values[property] }}
        onChange={(_key, value) => onChange(property, value)}
        removeable={{ onRemove: () => onRemove(property) }}
        autoFocus={added === property}
      />
    ))}
    <FilterGroup.ClearFilters onClick={onClear} />
  </FilterGroup>
);
