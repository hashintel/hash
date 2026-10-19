import { readScalar } from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import { validateSortKey } from "@local/hash-isomorphic-utils/flows/sort-key";
import { payloadKindTraits } from "@local/hash-isomorphic-utils/flows/types";

import { resolveSubject } from "./evaluate-condition.js";

import type { ConditionContext } from "./evaluate-condition.js";
import type { FilterListPayload } from "./filter-values.js";
import type { ConditionError } from "@local/hash-isomorphic-utils/flows/filter-condition";
import type {
  SortKey,
  SortKeyError,
  SortKeyKind,
} from "@local/hash-isomorphic-utils/flows/sort-key";
import type {
  PayloadKind,
  PayloadKindValues,
  PayloadPrimitive,
} from "@local/hash-isomorphic-utils/flows/types";

export type OrderByResult<Kind extends PayloadKind> =
  | {
      status: "success";
      items: { kind: Kind; value: PayloadKindValues[Kind][] };
    }
  | ConditionError
  | SortKeyError;

type SortValue = string | number | boolean;

/** Fixed, so that the order doesn't depend on the locale of the worker. */
const textCollator = new Intl.Collator("en");

/**
 * Compares two values read by `readScalar`. Text is collated; ISO calendar dates order as strings, date-times as
 * instants, and false comes before true.
 */
const compareSortValues = (
  primitive: PayloadPrimitive,
  left: SortValue,
  right: SortValue,
): number =>
  primitive === "text"
    ? textCollator.compare(String(left), String(right))
    : left < right
      ? -1
      : left > right
        ? 1
        : 0;

/**
 * Stable sort by one key. Missing and empty values (undefined, null or "") go last in either direction. Errors never
 * return a partially sorted list: a value not of the key's kind, a property with several values, or an entity that
 * isn't in `context` (one the user can't read).
 */
export const orderBy = <Kind extends PayloadKind>(
  input: FilterListPayload<Kind>,
  sortKey: SortKey,
  context: ConditionContext = {},
): OrderByResult<Kind> => {
  const error = validateSortKey(sortKey, input.kind);
  if (error) {
    return error;
  }
  const { subject, direction } = sortKey;
  /* validateSortKey checked it's one of the sort key kinds. */
  const kind = subject.payloadKind as SortKeyKind;
  const { primitive } = payloadKindTraits[kind];

  const keyed: { item: PayloadKindValues[Kind]; key?: SortValue }[] = [];
  for (const item of input.value) {
    const resolved = resolveSubject(
      subject,
      { kind: input.kind, value: item },
      context,
    );
    if (resolved.status === "error") {
      return resolved;
    }
    const { value } = resolved;
    if (Array.isArray(value)) {
      return {
        status: "error",
        code: "invalidValue",
        message:
          "The value to sort by has several values, so the list can't be sorted by it.",
      };
    }
    if (value === undefined || value === null || value === "") {
      keyed.push({ item });
      continue;
    }
    const key = readScalar(primitive, value);
    if (key === undefined) {
      return {
        status: "error",
        code: "invalidValue",
        message: `The value to sort by does not have kind ${kind}.`,
      };
    }
    keyed.push({ item, key });
  }

  const sign = direction === "ascending" ? 1 : -1;

  keyed.sort((left, right) =>
    left.key === undefined || right.key === undefined
      ? Number(left.key === undefined) - Number(right.key === undefined)
      : sign * compareSortValues(primitive, left.key, right.key),
  );

  return {
    status: "success",
    items: { kind: input.kind, value: keyed.map(({ item }) => item) },
  };
};
