import { useMemo } from "react";

import { Filter } from "@hashintel/ds-components";

import { getOperatorsForKind } from "../../shared/property-filters/get-operators-for-kind";
import { operatorDescriptionClass } from "./filter-chip-pill-chrome";

import type { OperatorDescriptor } from "../../shared/property-filters/get-operators-for-kind";
import type {
  FilterableProperty,
  PropertyFilter,
  PropertyFilterOperator,
} from "../../shared/property-filters/property-filter";
import type { FilterOperator, MenuItem } from "@hashintel/ds-components";
import type { FunctionComponent } from "react";

/** What a property switch carries over to the chip — see `onSwitchProperty`. */
export type SwitchablePropertyOption = Pick<
  FilterableProperty,
  "baseUrl" | "title" | "kind" | "enumOptions"
>;

/**
 * Operator keys map to `unknown` rather than per-operator value types: which
 * operators the chip offers varies with the property's value kind at runtime,
 * and the commit handler stores every value as a string regardless (see
 * {@link PropertyFilter.value}).
 */
type PropertyFilterValueMap = Record<PropertyFilterOperator, unknown>;

/**
 * A stored raw string as the committed value the chip displays. Mirrors
 * `coerceValueParameter` in `build-property-filter-clause.ts`: a missing,
 * empty, or (for numbers) unparseable value counts as none — the chip then
 * renders the operator's input empty, matching the filter contributing no
 * query clause.
 */
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

/**
 * The committed value the chip displays: a `[lower, upper]` pair for
 * `between` (both bounds required — a half-filled pair renders both inputs
 * empty, matching the inert filter), the selected values for a multi-select
 * operator, a scalar otherwise.
 */
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
 *
 * The chip commits only complete or fully cleared drafts: a cleared commit
 * keeps the filter with no value (inert — it contributes no query clause),
 * mirroring how value-less operators are active from the moment they are
 * selected.
 */
export const PropertyFilterChip: FunctionComponent<{
  filter: PropertyFilter;
  /** Overrides the kind-derived operator catalog (the archived filter's). */
  operatorDescriptors?: OperatorDescriptor[];
  className?: string;
  /**
   * The properties the chip's property segment offers switching to (it
   * renders as a menu trigger when present, ticking the current property).
   */
  propertyOptions?: SwitchablePropertyOption[];
  /** Fires with the picked property when it differs from the current one. */
  onSwitchProperty?: (property: SwitchablePropertyOption) => void;
  onCommit: (committed: PropertyFilter) => void;
  onRemove: () => void;
}> = ({
  filter,
  operatorDescriptors,
  className,
  propertyOptions,
  onSwitchProperty,
  onCommit,
  onRemove,
}) => {
  const operators = useMemo<
    Array<FilterOperator<PropertyFilterValueMap>>
  >(() => {
    // Enum-kind values are picked from the data type's constants rather than
    // typed free-form.
    const selectItems = (filter.enumOptions ?? []).map((option) => ({
      value: option,
      text: option,
    }));
    return (operatorDescriptors ?? getOperatorsForKind(filter.kind)).map(
      (descriptor) => {
        const valueInput =
          filter.kind === "number"
            ? { type: "number" as const }
            : filter.kind === "enum"
              ? { type: "select" as const, items: selectItems }
              : { type: "string" as const };
        return {
          key: descriptor.operator,
          label: descriptor.label,
          // A symbolic operator's dropdown row carries its English reading
          // as subtle text; `renderSelectedItem` keeps the chip's operator
          // segment to the bare symbol.
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
      },
    );
  }, [filter.kind, filter.enumOptions, operatorDescriptors]);

  const value = useMemo(
    () => ({ key: filter.operator, value: chipValue(filter) }),
    [filter],
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
        // The chip's inputs produce strings, numbers, a pair of numbers
        // (`between`), or a list of strings (multi-select); a cleared commit
        // (null) stores no value, leaving the filter inert. Every per-shape
        // field is reset on each commit so switching operators sheds stale
        // bounds and selections.
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
                (candidate): candidate is string =>
                  typeof candidate === "string",
              )
            : [];
          onCommit({
            ...base,
            values: selected.length > 0 ? selected : undefined,
          });
        } else {
          onCommit({ ...base, value: asRawString(committed) });
        }
      }}
      removeable={{ onRemove }}
    />
  );
};
