import { useMemo } from "react";

import { Filter } from "@hashintel/ds-components";

import { getOperatorsForKind } from "../../shared/property-filters/get-operators-for-kind";

import type { OperatorDescriptor } from "../../shared/property-filters/get-operators-for-kind";
import type {
  PropertyFilter,
  PropertyFilterOperator,
} from "../../shared/property-filters/property-filter";
import type { FilterOperator } from "@hashintel/ds-components";
import type { FunctionComponent } from "react";

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
 * empty, matching the inert filter), a scalar otherwise.
 */
const chipValue = (
  filter: PropertyFilter,
): string | number | [number, number] | null => {
  if (filter.operator === "between") {
    const lower = scalarChipValue(filter.value, filter.kind);
    const upper = scalarChipValue(filter.secondValue, filter.kind);
    return typeof lower === "number" && typeof upper === "number"
      ? [lower, upper]
      : null;
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
  onCommit: (committed: PropertyFilter) => void;
  onRemove: () => void;
}> = ({ filter, operatorDescriptors, onCommit, onRemove }) => {
  const operators = useMemo<Array<FilterOperator<PropertyFilterValueMap>>>(
    () =>
      (operatorDescriptors ?? getOperatorsForKind(filter.kind)).map(
        (descriptor) => {
          const valueInput =
            filter.kind === "number"
              ? { type: "number" as const }
              : { type: "string" as const };
          return {
            key: descriptor.operator,
            label: descriptor.label,
            input: !descriptor.requiresValue
              ? null
              : descriptor.range
                ? [valueInput, "and", valueInput]
                : valueInput,
          };
        },
      ),
    [filter.kind, operatorDescriptors],
  );

  const value = useMemo(
    () => ({ key: filter.operator, value: chipValue(filter) }),
    [filter],
  );

  return (
    <Filter<PropertyFilterValueMap>
      property={filter.id}
      propertyLabel={filter.title}
      operators={operators}
      value={value}
      onChange={(operator, committed) => {
        // The chip's inputs produce strings, numbers, or (for `between`) a
        // pair of numbers; a cleared commit (null) stores no value, leaving
        // the filter inert. `secondValue` only survives on `between`, so
        // switching operators sheds a stale upper bound.
        const [first, second] = Array.isArray(committed)
          ? committed
          : [committed, undefined];
        const asRawString = (bound: unknown): string | undefined =>
          typeof bound === "string"
            ? bound
            : typeof bound === "number"
              ? String(bound)
              : undefined;
        onCommit({
          ...filter,
          operator,
          value: asRawString(first),
          secondValue: asRawString(second),
        });
      }}
      removeable={{ onRemove }}
    />
  );
};
