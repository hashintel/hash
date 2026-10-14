import { isIsoDate } from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import { validateSortKey } from "@local/hash-isomorphic-utils/flows/sort-key";

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

const sortValueDescriptions: Record<SortKeyKind, string> = {
  Text: "text",
  Number: "a finite number",
  Date: "an ISO calendar date (YYYY-MM-DD)",
  Boolean: "true or false",
};

const isSortValue = (kind: SortKeyKind, value: unknown): value is SortValue => {
  switch (kind) {
    case "Text":
      return typeof value === "string";
    case "Date":
      return typeof value === "string" && isIsoDate(value);
    case "Number":
      return typeof value === "number" && Number.isFinite(value);
    case "Boolean":
      return typeof value === "boolean";
  }
};

/** ISO calendar dates order as strings; false (0) comes before true (1). */
const compareSortValues = (
  kind: SortKeyKind,
  left: SortValue,
  right: SortValue,
): number => {
  switch (kind) {
    case "Text":
      return textCollator.compare(String(left), String(right));
    case "Date": {
      const [leftDate, rightDate] = [String(left), String(right)];
      return leftDate < rightDate ? -1 : leftDate > rightDate ? 1 : 0;
    }
    case "Number":
    case "Boolean":
      return Number(left) - Number(right);
  }
};

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
    } else if (isSortValue(kind, value)) {
      keyed.push({ item, key: value });
    } else {
      return {
        status: "error",
        code: "invalidValue",
        message: `The value to sort by must be ${sortValueDescriptions[kind]}.`,
      };
    }
  }

  const sign = direction === "ascending" ? 1 : -1;

  keyed.sort((left, right) =>
    left.key === undefined || right.key === undefined
      ? Number(left.key === undefined) - Number(right.key === undefined)
      : sign * compareSortValues(kind, left.key, right.key),
  );

  return {
    status: "success",
    items: { kind: input.kind, value: keyed.map(({ item }) => item) },
  };
};
