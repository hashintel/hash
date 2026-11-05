import { deriveFilterableProperties } from "../../../../../../../shared/entities-visualizer/shared/property-filters/derive-filterable-properties";

import type { ConditionValueKind } from "./query-form";
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
  latestPropertyTypes: PropertyTypeWithMetadata[];
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
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

/**
 * The properties a condition can be on for entities of the given types, by title: those the entities table filters as
 * a single status, or as single text whose latest data type is a date.
 */
export const getConditionProperties = (
  {
    entityTypes,
    entityTypeParentIds,
    propertyTypes,
    latestPropertyTypes,
    dataTypes,
  }: ConditionOntology,
  entityTypeIds: VersionedUrl[],
): ConditionProperty[] => {
  const latestDataTypeIds = new Map<BaseUrl, VersionedUrl>();

  for (const { schema, metadata } of latestPropertyTypes) {
    const [only, ...others] = schema.oneOf;

    if (others.length === 0 && "$ref" in only) {
      latestDataTypeIds.set(metadata.recordId.baseUrl, only.$ref);
    }
  }

  return deriveFilterableProperties({
    dataTypes,
    entityTypeIds,
    entityTypeParentIds,
    entityTypes,
    propertyTypes,
  }).flatMap((property): ConditionProperty[] => {
    if (!property.filterable) {
      return [];
    }

    const { baseUrl, title } = property;

    if (property.kind === "enum" && property.enumOptions) {
      return [
        {
          baseUrl,
          title,
          valueKind: { kind: "status", options: property.enumOptions },
        },
      ];
    }

    const dataTypeId = latestDataTypeIds.get(baseUrl);

    return property.kind === "string" &&
      dataTypeId &&
      hasDateFormat(dataTypeId, dataTypes)
      ? [{ baseUrl, title, valueKind: { kind: "date" } }]
      : [];
  });
};
