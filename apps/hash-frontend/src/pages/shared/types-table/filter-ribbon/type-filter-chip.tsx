import { useMemo } from "react";

import { Filter } from "@hashintel/ds-components";

import {
  typeFilterFieldLabels,
  typeFilterOperatorsByField,
} from "../shared/type-filters";

import type { TypeFilter, TypeFilterOperator } from "../shared/type-filters";
import type {
  FilterOperator,
  FilterValue,
  ItemOrGroup,
  MenuItem,
  MultiSelectItem,
} from "@hashintel/ds-components";
import type { FunctionComponent } from "react";

type TypeFilterValueMap = {
  is: string;
  within: string;
  before: string;
  after: string;
  anyOf: string[];
  allOf: string[];
  noneOf: string[];
};

/**
 * A types-table filter as a ds-components `Filter` chip: the field label as a
 * switcher menu, an operator dropdown from the field's catalog, and the
 * operator's select / text input. Commits apply immediately — filtering is
 * client-side, so there is nothing to debounce.
 */
export const TypeFilterChip: FunctionComponent<{
  filter: TypeFilter;
  className?: string;
  fieldMenu?: MenuItem[];
  /** The options of the field's select inputs (multi and single alike). */
  selectItems: ReadonlyArray<ItemOrGroup<MultiSelectItem>>;
  searchable?: boolean;
  onCommit: (committed: TypeFilter) => void;
  onRemove: () => void;
}> = ({
  filter,
  className,
  fieldMenu,
  selectItems,
  searchable = false,
  onCommit,
  onRemove,
}) => {
  const operators = useMemo<Array<FilterOperator<TypeFilterValueMap>>>(() => {
    if (filter.field === "archived") {
      return [];
    }
    return typeFilterOperatorsByField[filter.field].map(
      (descriptor): FilterOperator<TypeFilterValueMap> => {
        switch (descriptor.input) {
          case "multiSelect":
            return {
              key: descriptor.operator,
              label: descriptor.label,
              input: {
                type: "select",
                multiple: true,
                items: selectItems,
                searchable,
              },
            };
          case "singleSelect":
            return {
              key: descriptor.operator,
              label: descriptor.label,
              input: { type: "select", items: selectItems },
            };
          default:
            return {
              key: descriptor.operator,
              label: descriptor.label,
              input: { type: "string", placeholder: "YYYY-MM-DD" },
            };
        }
      },
    );
  }, [filter.field, selectItems, searchable]);

  const value = useMemo<FilterValue<TypeFilterValueMap> | null>(() => {
    switch (filter.operator) {
      case "included":
        return null;
      case "anyOf":
      case "allOf":
      case "noneOf":
        return {
          key: filter.operator,
          value: filter.values?.length ? filter.values : null,
        };
      default:
        return {
          key: filter.operator,
          value: filter.value ?? null,
        };
    }
  }, [filter]);

  const commit = (
    operator: Exclude<TypeFilterOperator, "included">,
    committed: unknown,
  ) => {
    const base: TypeFilter = { id: filter.id, field: filter.field, operator };
    if (operator === "anyOf" || operator === "allOf" || operator === "noneOf") {
      const selected = Array.isArray(committed)
        ? committed.filter(
            (candidate): candidate is string => typeof candidate === "string",
          )
        : [];
      onCommit(selected.length > 0 ? { ...base, values: selected } : base);
    } else {
      onCommit(
        typeof committed === "string" && committed !== ""
          ? { ...base, value: committed }
          : base,
      );
    }
  };

  return (
    <Filter<TypeFilterValueMap>
      className={className}
      property={filter.id}
      propertyLabel={typeFilterFieldLabels[filter.field]}
      propertyMenu={fieldMenu}
      operators={operators}
      value={value}
      onChange={(operator, committed) => commit(operator, committed)}
      onInput={(operator, committed) => {
        if (committed !== null) {
          commit(operator, committed);
        }
      }}
      removeable={{ onRemove }}
    />
  );
};
