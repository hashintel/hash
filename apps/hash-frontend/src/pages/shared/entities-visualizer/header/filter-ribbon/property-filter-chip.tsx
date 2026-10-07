import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { Filter } from "@hashintel/ds-components";

import { getOperatorsForKind } from "../../shared/property-filters/get-operators-for-kind";
import { operatorDescriptionClass } from "./filter-chip-pill-chrome";

import type {
  FilterableProperty,
  PropertyFilter,
  PropertyFilterOperator,
} from "../../shared/property-filters/property-filter";
import type { FilterOperator, MenuItem } from "@hashintel/ds-components";
import type { FunctionComponent } from "react";

export type SwitchablePropertyOption = Pick<
  FilterableProperty,
  "baseUrl" | "title" | "kind" | "enumOptions"
>;

const liveFilterDebounceMs = 400;

type PropertyFilterValueMap = Record<PropertyFilterOperator, unknown>;

const scalarChipValue = (
  raw: string | undefined,
  kind: PropertyFilter["kind"],
): string | number | null => {
  if (raw === undefined || raw === "") {
    return null;
  }
  if (kind === "number") {
    const numeric = Number(raw);
    return raw.trim() !== "" && Number.isFinite(numeric) ? numeric : null;
  }
  return raw;
};

const chipValue = (
  filter: PropertyFilter,
): string | number | string[] | [number, number] | null => {
  if (filter.operator === "between") {
    const lower = scalarChipValue(filter.value, filter.kind);
    const upper = scalarChipValue(filter.secondValue, filter.kind);
    return typeof lower === "number" && typeof upper === "number"
      ? [lower, upper]
      : null;
  }
  if (filter.operator === "isNoneOf") {
    return filter.values?.length ? filter.values : null;
  }
  return scalarChipValue(filter.value, filter.kind);
};

/**
 * A property filter as a ds-components `Filter` chip: the property title,
 * an operator dropdown built from the kind's operator catalog, and a
 * text/number input for value-taking operators.
 */
export const PropertyFilterChip: FunctionComponent<{
  filter: PropertyFilter;
  className?: string;
  propertyOptions?: SwitchablePropertyOption[];
  onSwitchProperty?: (property: SwitchablePropertyOption) => void;
  onCommit: (committed: PropertyFilter) => void;
  onRemove: () => void;
}> = ({
  filter,
  className,
  propertyOptions,
  onSwitchProperty,
  onCommit,
  onRemove,
}) => {
  const operators = useMemo<
    Array<FilterOperator<PropertyFilterValueMap>>
  >(() => {
    const selectItems = (filter.enumOptions ?? []).map((option) => ({
      value: option,
      text: option,
    }));
    return getOperatorsForKind(filter.kind).map((descriptor) => {
      const valueInput =
        filter.kind === "number"
          ? { type: "number" as const }
          : filter.kind === "enum"
            ? { type: "select" as const, items: selectItems }
            : { type: "string" as const };
      return {
        key: descriptor.operator,
        label: descriptor.label,
        renderItem: descriptor.description ? (
          <span>
            {descriptor.label}
            <span className={operatorDescriptionClass}>
              {descriptor.description}
            </span>
          </span>
        ) : undefined,
        renderSelectedItem: descriptor.description
          ? descriptor.label
          : undefined,
        input: !descriptor.requiresValue
          ? null
          : descriptor.multi
            ? {
                type: "select" as const,
                multiple: true as const,
                items: selectItems,
              }
            : descriptor.range
              ? [valueInput, "and", valueInput]
              : valueInput,
      };
    });
  }, [filter.kind, filter.enumOptions]);

  const value = useMemo(
    () => ({ key: filter.operator, value: chipValue(filter) }),
    [filter],
  );

  const commitChange = useCallback(
    (operator: PropertyFilterOperator, committed: unknown) => {
      const asRawString = (raw: unknown): string | undefined =>
        typeof raw === "string"
          ? raw
          : typeof raw === "number"
            ? String(raw)
            : undefined;
      const base = {
        ...filter,
        operator,
        value: undefined,
        secondValue: undefined,
        values: undefined,
      };
      if (operator === "between" && Array.isArray(committed)) {
        onCommit({
          ...base,
          value: asRawString(committed[0]),
          secondValue: asRawString(committed[1]),
        });
      } else if (operator === "isNoneOf") {
        const selected = Array.isArray(committed)
          ? committed.filter(
              (candidate): candidate is string => typeof candidate === "string",
            )
          : [];
        onCommit({
          ...base,
          values: selected.length > 0 ? selected : undefined,
        });
      } else {
        onCommit({ ...base, value: asRawString(committed) });
      }
    },
    [filter, onCommit],
  );

  const commitChangeRef = useRef(commitChange);
  useEffect(() => {
    commitChangeRef.current = commitChange;
  });

  const debouncedCommitChange = useMemo(
    () =>
      debounce((operator: PropertyFilterOperator, committed: unknown) => {
        commitChangeRef.current(operator, committed);
      }, liveFilterDebounceMs),
    [],
  );

  // A `filter` change still drops any pending live commit it has outdated
  // (a property switch, or an external commit); so does unmounting.
  useEffect(
    () => () => {
      debouncedCommitChange.cancel();
    },
    [filter, debouncedCommitChange],
  );

  const propertyMenu = useMemo<MenuItem[] | undefined>(() => {
    if (!propertyOptions?.length || !onSwitchProperty) {
      return undefined;
    }
    return propertyOptions.map((property) => ({
      id: property.baseUrl,
      text: property.title,
      selected: property.baseUrl === filter.baseUrl,
      selectedStyle: "tick" as const,
      onClick: () => {
        if (property.baseUrl !== filter.baseUrl) {
          onSwitchProperty(property);
        }
      },
    }));
  }, [propertyOptions, onSwitchProperty, filter.baseUrl]);

  return (
    <Filter<PropertyFilterValueMap>
      className={className}
      property={filter.id}
      propertyLabel={filter.title}
      propertyMenu={propertyMenu}
      operators={operators}
      value={value}
      onChange={(operator, committed) => {
        // An explicit commit (Enter, blur, dropdown close) supersedes any
        // pending live application.
        debouncedCommitChange.cancel();
        commitChange(operator, committed);
      }}
      onInput={(operator, committed) => {
        if (committed === null) {
          // An incomplete draft never un-applies a filter, and a pending
          // live commit no longer reflects the input.
          debouncedCommitChange.cancel();
          return;
        }
        debouncedCommitChange(operator, committed);
      }}
      removeable={{ onRemove }}
    />
  );
};
