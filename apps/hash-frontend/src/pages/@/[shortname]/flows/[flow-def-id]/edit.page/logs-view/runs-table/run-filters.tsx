import { Button, Filter, FilterGroup, Menu } from "@hashintel/ds-components";

import { runStates, runStatesByUrgency } from "../run-state";

import type { RunFilters, RunTrigger } from "../run-list";
import type { RunState } from "../run-state";
import type { FilterOperator } from "@hashintel/ds-components";

export type RunFilterProperty = "status" | "trigger";

const propertyLabels: Record<RunFilterProperty, string> = {
  status: "Status",
  trigger: "Trigger",
};

const statusOperators: FilterOperator<{ isAnyOf: RunState[] }>[] = [
  {
    key: "isAnyOf",
    label: "is any of",
    input: {
      type: "select",
      multiple: true,
      placeholder: "Statuses…",
      items: runStatesByUrgency.map((state) => ({
        value: state,
        text: runStates[state].label,
      })),
    },
  },
];

const triggerOperators: FilterOperator<{ is: RunTrigger }>[] = [
  {
    key: "is",
    label: "is",
    input: {
      type: "select",
      items: [
        { value: "manual", text: "Manual" },
        { value: "scheduled", text: "Schedule" },
      ],
    },
  },
];

/** The Filter button, which adds a filter for a property not filtered on yet. */
export const AddRunFilter = ({
  shown,
  appliedCount,
  onAdd,
}: {
  shown: RunFilterProperty[];
  appliedCount: number;
  onAdd: (property: RunFilterProperty) => void;
}) => (
  <Menu
    position="bottom-end"
    items={(["status", "trigger"] as const).map((property) => ({
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
export const RunFilterBar = ({
  shown,
  added,
  filters,
  onChange,
  onRemove,
  onClear,
}: {
  shown: RunFilterProperty[];
  /** The filter just added, which takes focus. */
  added: RunFilterProperty | null;
  filters: RunFilters;
  onChange: (filters: RunFilters) => void;
  onRemove: (property: RunFilterProperty) => void;
  onClear: () => void;
}) => (
  <FilterGroup dismissAbandoned>
    {shown.map((property) =>
      property === "status" ? (
        <Filter<{ isAnyOf: RunState[] }>
          key={property}
          property={property}
          propertyLabel={propertyLabels[property]}
          operators={statusOperators}
          value={{
            key: "isAnyOf",
            value: filters.states.length > 0 ? filters.states : null,
          }}
          onChange={(_key, states) =>
            onChange({ ...filters, states: states ?? [] })
          }
          removeable={{ onRemove: () => onRemove(property) }}
          autoFocus={added === property}
        />
      ) : (
        <Filter<{ is: RunTrigger }>
          key={property}
          property={property}
          propertyLabel={propertyLabels[property]}
          operators={triggerOperators}
          value={{ key: "is", value: filters.trigger }}
          onChange={(_key, trigger) => onChange({ ...filters, trigger })}
          removeable={{ onRemove: () => onRemove(property) }}
          autoFocus={added === property}
        />
      ),
    )}
    <FilterGroup.ClearFilters onClick={onClear} />
  </FilterGroup>
);
