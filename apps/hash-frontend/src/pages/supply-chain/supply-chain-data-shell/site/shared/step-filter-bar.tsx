import { useMemo } from "react";

import {
  Button,
  Filter,
  FilterGroup,
  Menu,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  STEP_FILTER_DEFINITIONS,
  type ActiveStepFilter,
  type StepFilterKey,
  type StepFilterOptions,
  type StepFilterValue,
} from "./step-filters";

type MenuItems = React.ComponentProps<typeof Menu>["items"];

// With no chips the bar is just the add button; push it to the right edge of
// whatever row hosts it (a block band or a flex title row).
const emptyBarAlign = css({
  display: "flex",
  flex: "1",
  minW: "0",
  justifyContent: "flex-end",
});

/**
 * The shared filter row rendered above each site table. Chips are added from
 * a grouped dropdown behind the "+" button (labelled "Add filter" while the
 * bar is empty) and hold both operator and value; the parent owns the
 * `ActiveStepFilter[]` state so the set survives tab switches. Filters in
 * `skippedKeys` (not applicable to the adjacent table) render disabled with
 * an explanatory tooltip but stay editable via removal.
 */
export const StepFilterBar = ({
  filters,
  onFiltersChange,
  options,
  skippedKeys,
}: {
  filters: ActiveStepFilter[];
  onFiltersChange: (next: ActiveStepFilter[]) => void;
  options: StepFilterOptions;
  /** Active filter keys not applied to the adjacent table. */
  skippedKeys?: ReadonlySet<StepFilterKey>;
}) => {
  const addMenuItems = useMemo<MenuItems>(() => {
    const activeKeys = new Set(filters.map((filter) => filter.filterKey));
    const groups = new Map<
      string,
      Array<{ id: string; text: string; onClick: () => void }>
    >();
    for (const definition of STEP_FILTER_DEFINITIONS) {
      if (activeKeys.has(definition.key)) {
        continue;
      }
      const groupItems = groups.get(definition.group) ?? [];
      groupItems.push({
        id: definition.key,
        text: definition.label,
        onClick: () =>
          onFiltersChange([
            ...filters,
            { filterKey: definition.key, value: null },
          ]),
      });
      groups.set(definition.group, groupItems);
    }
    return [...groups.entries()].map(([label, items]) => ({
      id: label,
      label,
      items,
    }));
  }, [filters, onFiltersChange]);

  const setFilterValue = (
    filterKey: StepFilterKey,
    operatorKey: string,
    committed: unknown,
  ) => {
    const definition = STEP_FILTER_DEFINITIONS.find(
      (candidate) => candidate.key === filterKey,
    );
    const operator = definition
      ?.operators(options)
      .find((candidate) => candidate.key === operatorKey);
    // Input-less operators commit `(key, null)` as their active state; for
    // every other operator a null commit means the value was cleared.
    const value: StepFilterValue | null =
      committed == null && operator?.input !== null
        ? null
        : { key: operatorKey, value: committed };
    onFiltersChange(
      filters.map((filter) =>
        filter.filterKey === filterKey ? { ...filter, value } : filter,
      ),
    );
  };

  // With no chips there is no group to show: just a stock icon-only button
  // (regular Button styling, unlike the chip-scale FilterGroup.AddFilter used
  // below) opening the add-filter dropdown, pushed to the right of its host row.
  if (filters.length === 0) {
    if (addMenuItems.length === 0) {
      return null;
    }
    return (
      <div className={emptyBarAlign}>
        <Menu
          trigger={
            <Button
              variant="ghost"
              size="xs"
              iconName="filter"
              aria-label="Add filter"
            />
          }
          items={addMenuItems}
        />
      </div>
    );
  }

  return (
    <FilterGroup>
      {filters.map((filter) => {
        const definition = STEP_FILTER_DEFINITIONS.find(
          (candidate) => candidate.key === filter.filterKey,
        );
        if (!definition) {
          return null;
        }
        const skipped = skippedKeys?.has(filter.filterKey) ?? false;
        const chip = (
          <Filter
            key={filter.filterKey}
            property={filter.filterKey}
            propertyLabel={definition.label}
            operators={definition.operators(options)}
            value={filter.value}
            disabled={skipped}
            onChange={(operatorKey, committed) =>
              setFilterValue(filter.filterKey, operatorKey, committed)
            }
            removeable={{
              onRemove: () =>
                onFiltersChange(
                  filters.filter(
                    (candidate) => candidate.filterKey !== filter.filterKey,
                  ),
                ),
              // Chips left unconfigured (or emptied) fade out and remove
              // themselves once the user moves on.
              dismissAbandoned: true,
            }}
          />
        );
        if (!skipped) {
          return chip;
        }
        return (
          <Tooltip
            key={filter.filterKey}
            content={`"${definition.label}" does not apply to any row of this table, so it is not being applied here.`}
          >
            {chip}
          </Tooltip>
        );
      })}
      {addMenuItems.length > 0 && (
        <Menu
          trigger={<FilterGroup.AddFilter renderAs="plus" />}
          items={addMenuItems}
        />
      )}
      {/* A lone chip's own remove button already covers clearing. */}
      {filters.length > 1 && (
        <FilterGroup.ClearFilters onClick={() => onFiltersChange([])} />
      )}
    </FilterGroup>
  );
};
