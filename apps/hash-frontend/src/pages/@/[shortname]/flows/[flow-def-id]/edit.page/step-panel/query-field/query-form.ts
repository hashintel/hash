import { isIsoDate } from "@local/hash-isomorphic-utils/flows/datetime";

import type { BaseUrl } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";
import type { EntityQuery } from "@local/hash-isomorphic-utils/flows/types";

/** The values a condition compares a property with: a date, or one of the options of a status. */
export type ConditionValueKind =
  | { kind: "date" }
  | { kind: "status"; options: string[] };

const valueOperators = {
  is: "equal",
  isNot: "notEqual",
  before: "less",
  after: "greater",
} as const;

type ValueOperator = keyof typeof valueOperators;

export type ConditionOperator = ValueOperator | "isEmpty" | "isNotEmpty";

/**
 * A condition on a property of the entities: whether it has a value, or how its value compares with a fixed one, e.g.
 * a received date after 2026-09-30 or a status that is Active.
 */
export type QueryCondition =
  | { propertyBaseUrl: BaseUrl; operator: "isEmpty" | "isNotEmpty" }
  | { propertyBaseUrl: BaseUrl; operator: ValueOperator; value: string };

/** The operators offered for each kind of value, the first being picked for a new condition. */
export const operatorsByKind: Record<
  ConditionValueKind["kind"],
  ConditionOperator[]
> = {
  date: ["after", "before", "is", "isEmpty", "isNotEmpty"],
  status: ["is", "isNot", "isEmpty", "isNotEmpty"],
};

const lastEdited = "editionCreatedAtTransactionTime";
const created = "createdAtTransactionTime";

/** The orders the entities can come in. The step's own default, last edited first, sets no sorting paths. */
export const sortOrders = {
  lastEditedFirst: { label: "Last edited first", path: null },
  lastEditedLast: {
    label: "Last edited last",
    path: { path: [lastEdited], ordering: "ascending" },
  },
  newestFirst: {
    label: "Newest first",
    path: { path: [created], ordering: "descending" },
  },
  oldestFirst: {
    label: "Oldest first",
    path: { path: [created], ordering: "ascending" },
  },
  nameAToZ: {
    label: "Name, A to Z",
    path: { path: ["label"], ordering: "ascending" },
  },
  nameZToA: {
    label: "Name, Z to A",
    path: { path: ["label"], ordering: "descending" },
  },
} as const;

export type SortOrder = keyof typeof sortOrders;

/** A query as the panel edits it. */
export type QueryForm = {
  /** None means entities of any type. */
  entityTypeBaseUrls: BaseUrl[];
  conditions: QueryCondition[];
  /** Whether an entity must meet every condition or any of them. */
  join: "all" | "any";
  sort: SortOrder;
  limit?: number;
};

export const emptyQueryForm: QueryForm = {
  entityTypeBaseUrls: [],
  conditions: [],
  join: "all",
  sort: "lastEditedFirst",
};

const typePath = ["type", "baseUrl"];

const propertyPath = (baseUrl: BaseUrl) => ["properties", baseUrl];

const toClause = (condition: QueryCondition): Filter => {
  const path = propertyPath(condition.propertyBaseUrl);

  switch (condition.operator) {
    case "isEmpty":
      return { not: { exists: { path } } };
    case "isNotEmpty":
      return { exists: { path } };
    case "is":
      return { equal: [{ path }, { parameter: condition.value }] };
    case "isNot":
      return { notEqual: [{ path }, { parameter: condition.value }] };
    case "before":
      return { less: [{ path }, { parameter: condition.value }] };
    case "after":
      return { greater: [{ path }, { parameter: condition.value }] };
  }
};

/**
 * The query the step runs: entities of any of the types, meeting every condition or any of them. Its filter is
 * `{ all: [types?, conditions?] }`, the only shape `readQueryForm` reads back.
 */
export const toEntityQuery = ({
  entityTypeBaseUrls,
  conditions,
  join,
  sort,
  limit,
}: QueryForm): EntityQuery => {
  const clauses = conditions.map(toClause);
  const sortingPath = sortOrders[sort].path;

  return {
    filter: {
      all: [
        ...(entityTypeBaseUrls.length > 0
          ? [
              {
                any: entityTypeBaseUrls.map((baseUrl): Filter => ({
                  equal: [{ path: typePath }, { parameter: baseUrl }],
                })),
              },
            ]
          : []),
        ...(clauses.length > 0
          ? [join === "all" ? { all: clauses } : { any: clauses }]
          : []),
      ],
    },
    ...(sortingPath && {
      sortingPaths: [
        {
          path: [...sortingPath.path],
          ordering: sortingPath.ordering,
          nulls: "last",
        },
      ],
    }),
    ...(limit !== undefined && { limit }),
  };
};

/* Reading a saved query back checks every part of it, since it may have been made outside the panel. */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The value of an object's one key, if it has exactly that key. */
const onlyValue = (value: unknown, key: string): unknown =>
  isRecord(value) && Object.keys(value).length === 1 ? value[key] : undefined;

const isPath = (value: unknown, path: unknown[]) => {
  const actual = onlyValue(value, "path");

  return (
    Array.isArray(actual) &&
    actual.length === path.length &&
    actual.every((segment, index) => segment === path[index])
  );
};

/** The base URL of `{ path: ["properties", baseUrl] }`. */
const readPropertyPath = (value: unknown) => {
  const path = onlyValue(value, "path");

  return Array.isArray(path) &&
    path.length === 2 &&
    path[0] === "properties" &&
    typeof path[1] === "string"
    ? (path[1] as BaseUrl)
    : undefined;
};

/** The two sides of a comparison: a path, then a text parameter. */
const readComparison = (value: unknown) => {
  if (!Array.isArray(value) || value.length !== 2) {
    return undefined;
  }

  const parameter = onlyValue(value[1], "parameter");

  return typeof parameter === "string"
    ? { left: value[0] as unknown, parameter }
    : undefined;
};

const readTypeClause = (clause: unknown) => {
  const comparison = readComparison(onlyValue(clause, "equal"));

  return comparison && isPath(comparison.left, typePath)
    ? (comparison.parameter as BaseUrl)
    : undefined;
};

const isValueOf = (kind: ConditionValueKind, value: string) =>
  kind.kind === "date" ? isIsoDate(value) : kind.options.includes(value);

const readCondition = (
  clause: unknown,
  getValueKind: (baseUrl: BaseUrl) => ConditionValueKind | undefined,
): QueryCondition | undefined => {
  if (!isRecord(clause)) {
    return undefined;
  }

  const read = (): QueryCondition | undefined => {
    const notExists = onlyValue(onlyValue(clause, "not"), "exists");
    const emptyBaseUrl = readPropertyPath(notExists);

    if (emptyBaseUrl) {
      return { propertyBaseUrl: emptyBaseUrl, operator: "isEmpty" };
    }

    const notEmptyBaseUrl = readPropertyPath(onlyValue(clause, "exists"));

    if (notEmptyBaseUrl) {
      return { propertyBaseUrl: notEmptyBaseUrl, operator: "isNotEmpty" };
    }

    for (const [operator, filterKey] of Object.entries(valueOperators)) {
      const comparison = readComparison(onlyValue(clause, filterKey));
      const propertyBaseUrl = comparison && readPropertyPath(comparison.left);

      if (propertyBaseUrl) {
        return {
          propertyBaseUrl,
          operator: operator as ValueOperator,
          value: comparison.parameter,
        };
      }
    }

    return undefined;
  };

  const condition = read();
  const kind = condition && getValueKind(condition.propertyBaseUrl);

  return condition &&
    kind &&
    operatorsByKind[kind.kind].includes(condition.operator) &&
    (!("value" in condition) || isValueOf(kind, condition.value))
    ? condition
    : undefined;
};

const readEvery = <T>(
  items: unknown,
  readItem: (item: unknown) => T | undefined,
): T[] | undefined => {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }

  const read = items.map(readItem);

  return read.every((item) => item !== undefined) ? read : undefined;
};

const readSort = (sortingPaths: unknown): SortOrder | undefined => {
  if (sortingPaths === undefined) {
    return "lastEditedFirst";
  }

  if (!Array.isArray(sortingPaths) || sortingPaths.length !== 1) {
    return undefined;
  }

  const [only] = sortingPaths as unknown[];

  if (
    !isRecord(only) ||
    Object.keys(only).length !== 3 ||
    only.nulls !== "last"
  ) {
    return undefined;
  }

  return (Object.keys(sortOrders) as SortOrder[]).find((sort) => {
    const { path } = sortOrders[sort];

    return (
      path !== null &&
      path.ordering === only.ordering &&
      isPath({ path: only.path }, [...path.path])
    );
  });
};

/**
 * Reads a saved query back into the form it was made with, or `null` if the panel can't show it: one it didn't make,
 * e.g. with other filters, drafts or a time range, or one naming a property that isn't a date or status, an operator
 * that kind of value doesn't offer, or a value that isn't one of its own.
 */
export const readQueryForm = (
  query: unknown,
  getValueKind: (baseUrl: BaseUrl) => ConditionValueKind | undefined,
): QueryForm | null => {
  if (!isRecord(query)) {
    return null;
  }

  const { filter, sortingPaths, limit, ...rest } = query;
  const sort = readSort(sortingPaths);
  const parts = onlyValue(filter, "all");

  if (
    Object.values(rest).some((value) => value !== undefined) ||
    !sort ||
    (limit !== undefined && typeof limit !== "number") ||
    !Array.isArray(parts)
  ) {
    return null;
  }

  const form: QueryForm = {
    ...emptyQueryForm,
    sort,
    ...(typeof limit === "number" && { limit }),
  };
  const remaining: unknown[] = [...parts];

  const entityTypeBaseUrls = readEvery(
    onlyValue(remaining[0], "any"),
    readTypeClause,
  );

  if (entityTypeBaseUrls) {
    form.entityTypeBaseUrls = entityTypeBaseUrls;
    remaining.shift();
  }

  if (remaining.length > 1) {
    return null;
  }

  if (remaining.length === 1) {
    const join =
      isRecord(remaining[0]) && "any" in remaining[0] ? "any" : "all";
    const conditions = readEvery(onlyValue(remaining[0], join), (clause) =>
      readCondition(clause, getValueKind),
    );

    if (!conditions) {
      return null;
    }

    form.conditions = conditions;
    form.join = join;
  }

  return form;
};
