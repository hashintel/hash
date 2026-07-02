import { isBaseUrl } from "@blockprotocol/type-system";

import { getOperatorDescriptor } from "./property-filters/get-operators-for-kind";

import type { EntitiesFilterState } from "./filter-state";
import type {
  FilterValueKind,
  PropertyFilter,
  PropertyFilterOperator,
} from "./property-filters/property-filter";
import type { VersionedUrl, WebId } from "@blockprotocol/type-system";

/**
 * The shape of `router.query` (structurally equivalent to Node's
 * `ParsedUrlQuery`), declared locally to avoid importing a Node built-in into
 * frontend code.
 */
type UrlQuery = Record<string, string | string[] | undefined>;

const WEBS_KEY = "webs";
const OTHER_WEBS_KEY = "otherWebs";
const TYPES_KEY = "types";
const ARCHIVED_KEY = "archived";
/** Repeated once per property filter (e.g. `?propertyFilter=…&propertyFilter=…`). */
const PROPERTY_FILTER_KEY = "propertyFilter";

/**
 * The query parameter keys owned by the entities filter state. Used when
 * merging filter state into an existing URL so that unrelated parameters (e.g.
 * `entityTypeIdOrBaseUrl`) are left untouched.
 */
export const filterStateQueryKeys = [
  WEBS_KEY,
  OTHER_WEBS_KEY,
  TYPES_KEY,
  ARCHIVED_KEY,
  PROPERTY_FILTER_KEY,
] as const;

/**
 * Sentinel used for an explicitly empty selection, distinguishing it from an
 * absent parameter (which means "default", i.e. everything selected).
 */
const NONE_TOKEN = "none";
const TRUE_TOKEN = "true";

/** Separator for the comma-delimited web id / type id lists. */
const LIST_SEPARATOR = ",";
/**
 * Field separator within a single serialized property filter
 * (`baseUrl;kind;operator;value`). The value comes last so it may itself
 * contain the separator.
 */
const FIELD_SEPARATOR = ";";

const filterValueKinds: FilterValueKind[] = ["number", "string", "boolean"];

const isFilterValueKind = (value: string): value is FilterValueKind =>
  filterValueKinds.includes(value as FilterValueKind);

const getSingleValue = (
  value: string | string[] | undefined,
): string | undefined => {
  const single = Array.isArray(value) ? value[0] : value;
  // Treat an empty string the same as an absent parameter.
  return single === undefined || single === "" ? undefined : single;
};

const getMultiValue = (value: string | string[] | undefined): string[] => {
  if (value === undefined) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).filter(
    (entry) => entry !== "",
  );
};

/**
 * Derives a display title from a type's base URL slug, used as a fallback
 * where the actual title isn't (yet) available -- e.g. for filters restored
 * from the URL, which omit the title to stay compact.
 * e.g. `…/property-type/unit-of-measure/` -> "Unit Of Measure".
 */
export const titleFromBaseUrl = (baseUrl: string): string => {
  const segments = baseUrl.split("/").filter((segment) => segment.length > 0);
  const slug = segments[segments.length - 1] ?? baseUrl;
  return slug
    .split("-")
    .map((word) => (word ? `${word[0]!.toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
};

let urlPropertyFilterIdCounter = 0;

const parsePropertyFilter = (raw: string): PropertyFilter | null => {
  const [baseUrl, kind, operator, ...valueParts] = raw.split(FIELD_SEPARATOR);

  if (baseUrl === undefined || !isBaseUrl(baseUrl)) {
    return null;
  }

  if (kind === undefined || !isFilterValueKind(kind)) {
    return null;
  }

  if (
    operator === undefined ||
    !getOperatorDescriptor(kind, operator as PropertyFilterOperator)
  ) {
    return null;
  }

  urlPropertyFilterIdCounter += 1;

  return {
    id: `url-property-filter-${urlPropertyFilterIdCounter}`,
    baseUrl,
    title: titleFromBaseUrl(baseUrl),
    kind,
    operator: operator as PropertyFilterOperator,
    value: valueParts.length ? valueParts.join(FIELD_SEPARATOR) : undefined,
  };
};

const serializePropertyFilter = ({
  baseUrl,
  kind,
  operator,
  value,
}: PropertyFilter): string => {
  const fields: string[] = [baseUrl, kind, operator];
  if (value !== undefined) {
    fields.push(value);
  }
  return fields.join(FIELD_SEPARATOR);
};

const parseWebState = ({
  websValue,
  otherWebsValue,
  internalWebIds,
}: {
  websValue: string | undefined;
  otherWebsValue: string | undefined;
  internalWebIds: WebId[];
}): EntitiesFilterState["web"] => {
  const includeOtherWebs = otherWebsValue === TRUE_TOKEN;

  let selectedInternalWebIds: Set<WebId>;

  if (websValue === undefined) {
    selectedInternalWebIds = new Set(internalWebIds);
  } else if (websValue === NONE_TOKEN) {
    selectedInternalWebIds = new Set<WebId>();
  } else {
    const internalWebIdSet = new Set(internalWebIds);
    selectedInternalWebIds = new Set(
      websValue
        .split(LIST_SEPARATOR)
        .filter((id): id is WebId => internalWebIdSet.has(id as WebId)),
    );
  }

  return { selectedInternalWebIds, includeOtherWebs };
};

const parseTypeState = (
  typesValue: string | undefined,
): EntitiesFilterState["type"] => {
  if (typesValue === undefined) {
    return { selectedTypeIds: null };
  }

  if (typesValue === NONE_TOKEN) {
    return { selectedTypeIds: new Set<VersionedUrl>() };
  }

  return {
    selectedTypeIds: new Set(
      typesValue
        .split(LIST_SEPARATOR)
        .filter((id) => id.length > 0) as VersionedUrl[],
    ),
  };
};

/**
 * Builds an {@link EntitiesFilterState} from the URL query, falling back to the
 * defaults (all webs, all types, archived hidden, no property filters) for any
 * absent or malformed parameter.
 *
 * When the type is pinned (the visualizer is scoped to a specific entity type)
 * the type dimension is ignored, mirroring how the type filter pill is hidden.
 */
export const parseFilterStateFromQuery = ({
  query,
  internalWebIds,
  isTypePinned,
}: {
  query: UrlQuery;
  internalWebIds: WebId[];
  isTypePinned: boolean;
}): EntitiesFilterState => ({
  web: parseWebState({
    websValue: getSingleValue(query[WEBS_KEY]),
    otherWebsValue: getSingleValue(query[OTHER_WEBS_KEY]),
    internalWebIds,
  }),
  type: isTypePinned
    ? { selectedTypeIds: null }
    : parseTypeState(getSingleValue(query[TYPES_KEY])),
  includeArchived: getSingleValue(query[ARCHIVED_KEY]) === TRUE_TOKEN,
  propertyFilters: getMultiValue(query[PROPERTY_FILTER_KEY])
    .map(parsePropertyFilter)
    .filter((filter): filter is PropertyFilter => filter !== null),
});

/**
 * Serializes an {@link EntitiesFilterState} to a map of (decoded) query
 * parameter values, omitting any dimension that is at its default value so that
 * a pristine filter state produces a clean URL. Property filters are emitted as
 * a repeated parameter, one entry per filter.
 */
export const serializeFilterStateToQuery = ({
  filterState,
  internalWebIds,
  isTypePinned,
}: {
  filterState: EntitiesFilterState;
  internalWebIds: WebId[];
  isTypePinned: boolean;
}): Record<string, string | string[]> => {
  const values: Record<string, string | string[]> = {};

  const { selectedInternalWebIds, includeOtherWebs } = filterState.web;

  const selectedValidWebIds = internalWebIds.filter((id) =>
    selectedInternalWebIds.has(id),
  );
  const allWebsSelected = selectedValidWebIds.length === internalWebIds.length;

  if (!allWebsSelected) {
    values[WEBS_KEY] =
      selectedValidWebIds.length === 0
        ? NONE_TOKEN
        : selectedValidWebIds.join(LIST_SEPARATOR);
  }

  if (includeOtherWebs) {
    values[OTHER_WEBS_KEY] = TRUE_TOKEN;
  }

  if (!isTypePinned) {
    const { selectedTypeIds } = filterState.type;

    if (selectedTypeIds !== null) {
      values[TYPES_KEY] =
        selectedTypeIds.size === 0
          ? NONE_TOKEN
          : [...selectedTypeIds].join(LIST_SEPARATOR);
    }
  }

  if (filterState.includeArchived) {
    values[ARCHIVED_KEY] = TRUE_TOKEN;
  }

  if (filterState.propertyFilters.length > 0) {
    values[PROPERTY_FILTER_KEY] = filterState.propertyFilters.map(
      serializePropertyFilter,
    );
  }

  return values;
};

/**
 * Percent-encodes a query value while leaving characters that are legal in a URL
 * query and aid readability (`:` `/` `@` `,` `;`) intact, so type and property
 * URLs remain legible rather than turning into `%3A%2F%2F…` noise.
 */
const encodeQueryValue = (value: string): string =>
  encodeURIComponent(value)
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/")
    .replace(/%40/g, "@")
    .replace(/%2C/g, ",")
    .replace(/%3B/g, ";");

const parseRawPairs = (search: string): [string, string][] =>
  search
    ? search.split("&").map((pair): [string, string] => {
        const equalsIndex = pair.indexOf("=");
        return equalsIndex === -1
          ? [pair, ""]
          : [pair.slice(0, equalsIndex), pair.slice(equalsIndex + 1)];
      })
    : [];

const groupRawValuesByKey = (
  pairs: [string, string][],
): Map<string, string[]> => {
  const byKey = new Map<string, string[]>();
  for (const [key, rawValue] of pairs) {
    const existing = byKey.get(key);
    if (existing) {
      existing.push(rawValue);
    } else {
      byKey.set(key, [rawValue]);
    }
  }
  return byKey;
};

const arraysEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Merges the given filter parameter values into an existing `asPath`, leaving
 * any non-filter parameters in place. Comparison is performed against the raw
 * (already-encoded) query so the result is stable across re-renders, and values
 * are written with {@link encodeQueryValue} to keep URLs readable. Returns
 * whether the resulting path differs so callers can avoid redundant navigations.
 */
export const applyFilterValuesToAsPath = ({
  asPath,
  filterValues,
}: {
  asPath: string;
  filterValues: Record<string, string | string[]>;
}): { changed: boolean; nextAsPath: string } => {
  const [path = "", search = ""] = asPath.split("?");
  const existingPairs = parseRawPairs(search);
  const currentByKey = groupRawValuesByKey(existingPairs);

  const desiredByKey = new Map<string, string[]>();
  for (const key of filterStateQueryKeys) {
    const value = filterValues[key];
    if (value === undefined) {
      continue;
    }
    const list = Array.isArray(value) ? value : [value];
    desiredByKey.set(key, list.map(encodeQueryValue));
  }

  const changed = filterStateQueryKeys.some(
    (key) =>
      !arraysEqual(currentByKey.get(key) ?? [], desiredByKey.get(key) ?? []),
  );

  if (!changed) {
    return { changed: false, nextAsPath: asPath };
  }

  const ownedKeys = new Set<string>(filterStateQueryKeys);

  const rebuilt = existingPairs
    .filter(([key]) => !ownedKeys.has(key))
    .map(([key, rawValue]) => (rawValue === "" ? key : `${key}=${rawValue}`));

  for (const key of filterStateQueryKeys) {
    for (const rawValue of desiredByKey.get(key) ?? []) {
      rebuilt.push(`${key}=${rawValue}`);
    }
  }

  const nextSearch = rebuilt.join("&");

  return {
    changed: true,
    nextAsPath: nextSearch ? `${path}?${nextSearch}` : path,
  };
};
