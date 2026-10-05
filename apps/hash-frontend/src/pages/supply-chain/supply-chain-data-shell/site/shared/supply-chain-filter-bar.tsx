import { useEffect, useMemo } from "react";

import {
  Button,
  Filter,
  FilterGroup,
  Menu,
  Tooltip,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  STEP_FILTER_MENUS,
  supplyChainFilterDefinition,
  supplyChainFilterLabel,
  type ActiveSupplyChainFilter,
  type SupplyChainFilterKey,
  type SupplyChainFilterOptions,
  type SupplyChainFilterValue,
  type SupplyChainFilterView,
} from "./supply-chain-filters";

type MenuItems = React.ComponentProps<typeof Menu>["items"];

// The chip to autofocus on the render that adds it. Module-scoped rather than
// component state: adding the first chip moves the bar from the header
// actions into the chips row, remounting the bar (and its FilterGroup, whose
// own fresh-chip focus treats first-mount chips as restored state) — any
// in-component record of the addition would be lost with it. Consumed by one
// render pass, then cleared.
let pendingAutoFocusKey: SupplyChainFilterKey | null = null;

// With no chips the bar is just the add button; push it to the right edge of
// whatever row hosts it (a block band or a flex title row).
const emptyBarAlign = css({
  display: "flex",
  flex: "1",
  minW: "0",
  justifyContent: "flex-end",
});

export const SupplyChainFilterBar = ({
  view,
  filters,
  onFiltersChange,
  options,
  skippedKeys,
  addableKeys,
}: {
  /** The hosting view; selects the add menu's layout and group order. */
  view: SupplyChainFilterView;
  filters: ActiveSupplyChainFilter[];
  onFiltersChange: (next: ActiveSupplyChainFilter[]) => void;
  options: SupplyChainFilterOptions;
  /** Active filter keys not applied to the adjacent table. */
  skippedKeys?: ReadonlySet<SupplyChainFilterKey>;
  /**
   * Filter keys the adjacent table can offer in the add menu (see
   * `applicableFilterKeys`). Filters already active render regardless, so a
   * set carried over from another view survives — it just cannot be added
   * afresh here. Omit to offer the view's whole menu.
   */
  addableKeys?: ReadonlySet<SupplyChainFilterKey>;
}) => {
  // Read for this render, then cleared so later remounts (tab switches, the
  // other table's bar) never re-focus the same key.
  const autoFocusKey = pendingAutoFocusKey;
  useEffect(() => {
    pendingAutoFocusKey = null;
  });

  const addMenuItems = useMemo<MenuItems>(() => {
    const activeKeys = new Set(filters.map((filter) => filter.filterKey));
    const addFilter = (filterKey: SupplyChainFilterKey) => {
      pendingAutoFocusKey = filterKey;
      // Pre-select the first operator so the chip mounts ready for a value
      // (an input-less first operator is thereby applied immediately).
      const firstOperator =
        supplyChainFilterDefinition(filterKey)?.operators(options)[0];
      onFiltersChange([
        ...filters,
        {
          filterKey,
          value: firstOperator ? { key: firstOperator.key, value: null } : null,
        },
      ]);
    };
    return STEP_FILTER_MENUS[view].flatMap(({ group, keys }): MenuItems => {
      const items = keys
        .flatMap((key) => {
          if (activeKeys.has(key) || (addableKeys && !addableKeys.has(key))) {
            return [];
          }
          const definition = supplyChainFilterDefinition(key);
          return definition
            ? [
                {
                  id: key,
                  text: supplyChainFilterLabel(definition, options),
                  onClick: () => addFilter(key),
                },
              ]
            : [];
        })
        .sort((left, right) => left.text.localeCompare(right.text));
      if (items.length === 0) {
        return [];
      }
      // A heading-less entry lists its filters as ungrouped items.
      return group ? [{ id: group, label: group, items }] : items;
    });
  }, [view, filters, onFiltersChange, addableKeys, options]);

  const setFilterValue = (
    filterKey: SupplyChainFilterKey,
    operatorKey: string,
    committed: unknown,
  ) => {
    const definition = supplyChainFilterDefinition(filterKey);
    const operator = definition
      ?.operators(options)
      .find((candidate) => candidate.key === operatorKey);
    // Input-less operators commit `(key, null)` as their active state; for
    // every other operator a null commit means the value was cleared.
    const value: SupplyChainFilterValue | null =
      committed == null && operator?.input !== null
        ? null
        : { key: operatorKey, value: committed };
    onFiltersChange(
      filters.map((filter) =>
        filter.filterKey === filterKey ? { ...filter, value } : filter,
      ),
    );
  };

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
    <FilterGroup dismissAbandoned>
      {filters.map((filter) => {
        const definition = supplyChainFilterDefinition(filter.filterKey);
        if (!definition) {
          return null;
        }
        const skipped = skippedKeys?.has(filter.filterKey) ?? false;
        const label = supplyChainFilterLabel(definition, options);
        const chip = (
          <Filter
            key={filter.filterKey}
            property={filter.filterKey}
            propertyLabel={label}
            operators={definition.operators(options)}
            value={filter.value}
            disabled={skipped}
            autoFocus={filter.filterKey === autoFocusKey}
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
            }}
          />
        );
        if (!skipped) {
          return chip;
        }
        return (
          <Tooltip
            key={filter.filterKey}
            content={`"${label}" is ignored as it does not apply to this table.`}
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
