import {
  compareOntologyTypeVersions,
  extractBaseUrl,
} from "@blockprotocol/type-system";

import type {
  BaseUrl,
  DataType,
  DataTypeWithMetadata,
  EntityType,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * The types-table filter ribbon's model: a fixed catalog of filterable fields,
 * the operators each offers, and a predicate factory that evaluates committed
 * filters client-side against the full type objects (the table already holds
 * every type in memory).
 */

export type TypesTableTypeKind =
  | "entity-type"
  | "link-type"
  | "property-type"
  | "data-type";

export type TypeFilterField =
  | "archived"
  | "kind"
  | "lastEdited"
  | "lastEditedBy"
  | "inheritsFrom"
  | "hasProperty";

export type MultiSelectTypeFilterOperator = "anyOf" | "allOf" | "noneOf";
export type SingleSelectTypeFilterOperator = "within";
export type DateTypeFilterOperator = "before" | "after";

export type TypeFilterOperator =
  /**
   * The archived filter only (value-less): contributes no clause of its own —
   * the filter's presence flips the table's `includeArchived` scope.
   */
  | "included"
  | MultiSelectTypeFilterOperator
  | SingleSelectTypeFilterOperator
  | DateTypeFilterOperator;

export type TypeFilter = {
  /** Stable client-side id, used for React keys and editing. */
  id: string;
  field: TypeFilterField;
  operator: TypeFilterOperator;
  /**
   * The committed value of single-input operators (`within` / `before` /
   * `after`). Absent or invalid for the operator means the filter is
   * incomplete and contributes no clause.
   */
  value?: string;
  /** The committed selection of multi-select operators; empty ⇒ no clause. */
  values?: string[];
};

export type TypeFilterOperatorDescriptor =
  | {
      operator: MultiSelectTypeFilterOperator;
      label: string;
      input: "multiSelect";
    }
  | {
      operator: SingleSelectTypeFilterOperator;
      label: string;
      input: "singleSelect";
    }
  | { operator: DateTypeFilterOperator; label: string; input: "date" };

const typeReferenceOperators: TypeFilterOperatorDescriptor[] = [
  { operator: "anyOf", label: "any of", input: "multiSelect" },
  { operator: "allOf", label: "all of", input: "multiSelect" },
  { operator: "noneOf", label: "none of", input: "multiSelect" },
];

export const typeFilterOperatorsByField: Record<
  Exclude<TypeFilterField, "archived">,
  TypeFilterOperatorDescriptor[]
> = {
  kind: [
    { operator: "anyOf", label: "is any of", input: "multiSelect" },
    { operator: "noneOf", label: "is none of", input: "multiSelect" },
  ],
  lastEdited: [
    { operator: "within", label: "in the last", input: "singleSelect" },
    { operator: "after", label: "on or after", input: "date" },
    { operator: "before", label: "before", input: "date" },
  ],
  lastEditedBy: [
    { operator: "anyOf", label: "is any of", input: "multiSelect" },
    { operator: "noneOf", label: "is none of", input: "multiSelect" },
  ],
  inheritsFrom: typeReferenceOperators,
  hasProperty: typeReferenceOperators,
};

export const typeFilterFieldLabels: Record<TypeFilterField, string> = {
  archived: "Include archived",
  kind: "Kind",
  lastEdited: "Last edited",
  lastEditedBy: "Last edited by",
  inheritsFrom: "Inherits from",
  hasProperty: "Has attribute",
};

export const getDefaultTypeFilterOperator = (
  field: TypeFilterField,
): TypeFilterOperator => {
  if (field === "archived") {
    return "included";
  }
  const firstOperator = typeFilterOperatorsByField[field][0];
  if (!firstOperator) {
    throw new Error(`No operators defined for filter field "${field}"`);
  }
  return firstOperator.operator;
};

export const typeKindFilterOptions: Array<{
  value: TypesTableTypeKind;
  text: string;
}> = [
  { value: "entity-type", text: "Entity type" },
  { value: "link-type", text: "Link type" },
  { value: "property-type", text: "Property type" },
  { value: "data-type", text: "Data type" },
];

/** Values are a number of days, evaluated against the edition's start time. */
export const lastEditedWithinOptions: Array<{ value: string; text: string }> = [
  { value: "1", text: "24 hours" },
  { value: "7", text: "7 days" },
  { value: "30", text: "30 days" },
  { value: "90", text: "90 days" },
  { value: "365", text: "12 months" },
];

type TypeWithMetadata =
  | EntityTypeWithMetadata
  | PropertyTypeWithMetadata
  | DataTypeWithMetadata;

export const getTypeKind = (
  type: TypeWithMetadata,
  isSpecialEntityTypeLookup:
    | Record<VersionedUrl, { isLink: boolean }>
    | null
    | undefined,
): TypesTableTypeKind => {
  const { schema } = type;
  return schema.kind === "entityType"
    ? isSpecialEntityTypeLookup?.[schema.$id]?.isLink
      ? "link-type"
      : "entity-type"
    : schema.kind === "propertyType"
      ? "property-type"
      : "data-type";
};

const dayInMs = 24 * 60 * 60 * 1000;

const dateFilterValueFormat = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a committed `before` / `after` value to a local start-of-day timestamp. */
const parseDateFilterValue = (value: string): number | null => {
  if (!dateFilterValueFormat.test(value)) {
    return null;
  }
  const timestamp = Date.parse(`${value}T00:00:00`);
  return Number.isNaN(timestamp) ? null : timestamp;
};

/** Incomplete filters (and the scope-only archived filter) contribute no clause. */
const isApplicableFilter = (filter: TypeFilter): boolean => {
  switch (filter.operator) {
    case "included":
      return false;
    case "within":
      return !!filter.value;
    case "before":
    case "after":
      return !!filter.value && parseDateFilterValue(filter.value) !== null;
    case "anyOf":
    case "allOf":
    case "noneOf":
      return (filter.values?.length ?? 0) > 0;
  }
};

const matchesSelection = (
  filter: TypeFilter,
  candidates: ReadonlyArray<string>,
): boolean => {
  const selected = filter.values ?? [];
  switch (filter.operator) {
    case "anyOf":
      return selected.some((value) => candidates.includes(value));
    case "allOf":
      return selected.every((value) => candidates.includes(value));
    case "noneOf":
      return !selected.some((value) => candidates.includes(value));
    default:
      return false;
  }
};

type TypeLineage = {
  ancestorBaseUrls: ReadonlyArray<string>;
  propertyBaseUrls: ReadonlyArray<string>;
};

const emptyLineage: TypeLineage = {
  ancestorBaseUrls: [],
  propertyBaseUrls: [],
};

export type TypeFilterEvaluationSources = {
  /** Every known entity type (all versions), for resolving inheritance chains. */
  entityTypes: EntityTypeWithMetadata[] | null | undefined;
  /** Every known data type keyed by versioned URL. */
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata> | null;
  isSpecialEntityTypeLookup:
    | Record<VersionedUrl, { isLink: boolean }>
    | null
    | undefined;
};

/**
 * Builds a predicate applying the committed filters to a type. Inheritance is
 * resolved transitively (matching on base URL, so selecting a type matches
 * descendants of any of its versions), and `hasProperty` counts inherited
 * properties as well as the type's own.
 */
export const createTypeFilterPredicate = (
  filters: TypeFilter[],
  {
    entityTypes,
    dataTypes,
    isSpecialEntityTypeLookup,
  }: TypeFilterEvaluationSources,
): ((type: TypeWithMetadata) => boolean) => {
  const applicableFilters = filters.filter(isApplicableFilter);
  if (applicableFilters.length === 0) {
    return () => true;
  }

  const now = Date.now();

  const entityTypeSchemasById = new Map<VersionedUrl, EntityType>();
  const latestEntityTypesByBaseUrl = new Map<BaseUrl, EntityTypeWithMetadata>();
  for (const entityType of entityTypes ?? []) {
    entityTypeSchemasById.set(entityType.schema.$id, entityType.schema);
    const baseUrl = entityType.metadata.recordId.baseUrl;
    const existing = latestEntityTypesByBaseUrl.get(baseUrl);
    if (
      !existing ||
      compareOntologyTypeVersions(
        existing.metadata.recordId.version,
        entityType.metadata.recordId.version,
      ) < 0
    ) {
      latestEntityTypesByBaseUrl.set(baseUrl, entityType);
    }
  }

  const dataTypesById = dataTypes ?? {};
  const latestDataTypesByBaseUrl = new Map<BaseUrl, DataTypeWithMetadata>();
  for (const dataType of Object.values(dataTypesById)) {
    const baseUrl = dataType.metadata.recordId.baseUrl;
    const existing = latestDataTypesByBaseUrl.get(baseUrl);
    if (
      !existing ||
      compareOntologyTypeVersions(
        existing.metadata.recordId.version,
        dataType.metadata.recordId.version,
      ) < 0
    ) {
      latestDataTypesByBaseUrl.set(baseUrl, dataType);
    }
  }

  const resolveEntityTypeSchema = (ref: VersionedUrl): EntityType | undefined =>
    entityTypeSchemasById.get(ref) ??
    latestEntityTypesByBaseUrl.get(extractBaseUrl(ref))?.schema;

  const resolveDataTypeSchema = (ref: VersionedUrl): DataType | undefined =>
    dataTypesById[ref]?.schema ??
    latestDataTypesByBaseUrl.get(extractBaseUrl(ref))?.schema;

  const entityTypeLineage = (schema: EntityType): TypeLineage => {
    const ancestorBaseUrls = new Set<string>();
    const propertyBaseUrls = new Set<string>(Object.keys(schema.properties));
    const pendingRefs = (schema.allOf ?? []).map((parent) => parent.$ref);
    while (pendingRefs.length > 0) {
      const ref = pendingRefs.pop();
      if (!ref) {
        break;
      }
      const baseUrl = extractBaseUrl(ref);
      if (ancestorBaseUrls.has(baseUrl)) {
        continue;
      }
      ancestorBaseUrls.add(baseUrl);
      const parent = resolveEntityTypeSchema(ref);
      if (!parent) {
        continue;
      }
      for (const propertyBaseUrl of Object.keys(parent.properties)) {
        propertyBaseUrls.add(propertyBaseUrl);
      }
      pendingRefs.push(
        ...(parent.allOf ?? []).map((ancestor) => ancestor.$ref),
      );
    }
    return {
      ancestorBaseUrls: [...ancestorBaseUrls],
      propertyBaseUrls: [...propertyBaseUrls],
    };
  };

  const dataTypeLineage = (schema: DataType): TypeLineage => {
    const ancestorBaseUrls = new Set<string>();
    const pendingRefs = (schema.allOf ?? []).map((parent) => parent.$ref);
    while (pendingRefs.length > 0) {
      const ref = pendingRefs.pop();
      if (!ref) {
        break;
      }
      const baseUrl = extractBaseUrl(ref);
      if (ancestorBaseUrls.has(baseUrl)) {
        continue;
      }
      ancestorBaseUrls.add(baseUrl);
      const parent = resolveDataTypeSchema(ref);
      if (parent) {
        pendingRefs.push(
          ...(parent.allOf ?? []).map((ancestor) => ancestor.$ref),
        );
      }
    }
    return { ancestorBaseUrls: [...ancestorBaseUrls], propertyBaseUrls: [] };
  };

  const lineageForType = (type: TypeWithMetadata): TypeLineage => {
    const { schema } = type;
    return schema.kind === "entityType"
      ? entityTypeLineage(schema)
      : schema.kind === "dataType"
        ? dataTypeLineage(schema)
        : emptyLineage;
  };

  const typeMatchesFilter = (
    type: TypeWithMetadata,
    filter: TypeFilter,
    getLineage: () => TypeLineage,
  ): boolean => {
    switch (filter.field) {
      case "archived":
        return true;
      case "kind":
        return matchesSelection(filter, [
          getTypeKind(type, isSpecialEntityTypeLookup),
        ]);
      case "lastEdited": {
        const lastEditedAt = Date.parse(
          type.metadata.temporalVersioning.transactionTime.start.limit,
        );
        if (Number.isNaN(lastEditedAt)) {
          return false;
        }
        switch (filter.operator) {
          case "within": {
            const days = Number(filter.value);
            return (
              Number.isFinite(days) && lastEditedAt >= now - days * dayInMs
            );
          }
          case "after": {
            const bound = parseDateFilterValue(filter.value ?? "");
            return bound !== null && lastEditedAt >= bound;
          }
          case "before": {
            const bound = parseDateFilterValue(filter.value ?? "");
            return bound !== null && lastEditedAt < bound;
          }
          default:
            return false;
        }
      }
      case "lastEditedBy":
        return matchesSelection(filter, [
          type.metadata.provenance.edition.createdById,
        ]);
      case "inheritsFrom":
        return matchesSelection(filter, getLineage().ancestorBaseUrls);
      case "hasProperty":
        return matchesSelection(filter, getLineage().propertyBaseUrls);
    }
  };

  return (type) => {
    let lineage: TypeLineage | undefined;
    const getLineage = () => {
      lineage ??= lineageForType(type);
      return lineage;
    };
    return applicableFilters.every((filter) =>
      typeMatchesFilter(type, filter, getLineage),
    );
  };
};
