import { deriveFilterableProperties } from "../../../../../../../shared/entities-visualizer/shared/property-filters/derive-filterable-properties";

import type { FilterMetadataForProperty } from "../../../../../../../shared/entities-visualizer/shared/property-filters/property-filter";
import type { ConditionValueKind } from "../../shared/query-form";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

/** A property a condition can be on: one whose value is a date or a status. */
export type ConditionProperty = {
  baseUrl: BaseUrl;
  title: string;
  valueKind: ConditionValueKind;
};

export type ConditionOntology = {
  entityTypes: EntityTypeWithMetadata[];
  entityTypeParentIds: Record<VersionedUrl, VersionedUrl[]>;
  /** Every version, as the entity types refer to them. */
  propertyTypes: Record<VersionedUrl, PropertyTypeWithMetadata>;
  /** From {@link getLatestDataTypeIds}. */
  latestDataTypeIds: Map<BaseUrl, VersionedUrl>;
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
};

/** By base URL, the data type of the latest version of each property whose value is a single data type. */
export const getLatestDataTypeIds = (
  latestPropertyTypes: PropertyTypeWithMetadata[],
) => {
  const dataTypeIds = new Map<BaseUrl, VersionedUrl>();

  for (const { schema, metadata } of latestPropertyTypes) {
    const [only, ...others] = schema.oneOf;

    if (others.length === 0 && "$ref" in only) {
      dataTypeIds.set(metadata.recordId.baseUrl, only.$ref);
    }
  }

  return dataTypeIds;
};

/** Whether a data type, or one it inherits from, has format `date`. */
const hasDateFormat = (
  dataTypeId: VersionedUrl,
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>,
  seen = new Set<VersionedUrl>(),
): boolean => {
  const schema = dataTypes[dataTypeId]?.schema;

  if (!schema || seen.has(dataTypeId)) {
    return false;
  }

  seen.add(dataTypeId);

  if ("anyOf" in schema) {
    const [only, ...others] = schema.anyOf;
    return others.length === 0 && "format" in only && only.format === "date";
  }

  if ("format" in schema && schema.format === "date") {
    return true;
  }

  return (schema.allOf ?? []).some(({ $ref }) =>
    hasDateFormat($ref, dataTypes, seen),
  );
};

const toConditionProperty = (
  property: FilterMetadataForProperty,
  { latestDataTypeIds, dataTypes }: ConditionOntology,
): ConditionProperty | undefined => {
  if (!property.filterable) {
    return undefined;
  }

  const { baseUrl, title } = property;

  if (property.kind === "enum" && property.enumOptions) {
    return {
      baseUrl,
      title,
      valueKind: { kind: "status", options: property.enumOptions },
    };
  }

  const dataTypeId = latestDataTypeIds.get(baseUrl);

  return property.kind === "string" &&
    dataTypeId &&
    hasDateFormat(dataTypeId, dataTypes)
    ? { baseUrl, title, valueKind: { kind: "date" } }
    : undefined;
};

/**
 * The properties a condition can be on for entities of any of the given types, by title: those the entities table
 * filters as a single status, or as single text whose latest data type is a date.
 */
export const getConditionProperties = (
  ontology: ConditionOntology,
  entityTypeIds: VersionedUrl[],
): ConditionProperty[] => {
  const properties = new Map<BaseUrl, ConditionProperty>();

  /*
   * One type at a time: across several, the first type with a property decides its shape, so a list on one type would
   * hide the single value another has.
   */
  for (const entityTypeId of entityTypeIds) {
    for (const property of deriveFilterableProperties({
      dataTypes: ontology.dataTypes,
      entityTypeIds: [entityTypeId],
      entityTypeParentIds: ontology.entityTypeParentIds,
      entityTypes: ontology.entityTypes,
      propertyTypes: ontology.propertyTypes,
    })) {
      const conditionProperty = toConditionProperty(property, ontology);

      if (conditionProperty && !properties.has(conditionProperty.baseUrl)) {
        properties.set(conditionProperty.baseUrl, conditionProperty);
      }
    }
  }

  return [...properties.values()].sort((left, right) =>
    left.title.localeCompare(right.title),
  );
};
