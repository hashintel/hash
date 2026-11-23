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

/** What a property's single value is, as a flow condition reads it. A text with options is a status. */
export type PropertyValueKind =
  | { kind: "Text"; options?: string[] }
  | { kind: "Number" }
  | { kind: "Date" }
  | { kind: "Boolean" };

/** A property a condition can check: one with a single value of a kind it compares. */
export type EntityProperty = {
  baseUrl: BaseUrl;
  title: string;
  valueKind: PropertyValueKind;
};

/** A property Find entities' conditions can be on: one whose value is a date or a status. */
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

const toEntityProperty = (
  property: FilterMetadataForProperty,
  { latestDataTypeIds, dataTypes }: ConditionOntology,
): EntityProperty | undefined => {
  if (!property.filterable) {
    return undefined;
  }

  const { baseUrl, title } = property;

  switch (property.kind) {
    case "enum":
      return property.enumOptions
        ? {
            baseUrl,
            title,
            valueKind: { kind: "Text", options: property.enumOptions },
          }
        : undefined;
    case "number":
      return { baseUrl, title, valueKind: { kind: "Number" } };
    case "boolean":
      return { baseUrl, title, valueKind: { kind: "Boolean" } };
    case "string": {
      const dataTypeId = latestDataTypeIds.get(baseUrl);

      return {
        baseUrl,
        title,
        valueKind:
          dataTypeId && hasDateFormat(dataTypeId, dataTypes)
            ? { kind: "Date" }
            : { kind: "Text" },
      };
    }
    /* A list, or a value of several shapes, has no single value to compare. */
    case "textList":
    case "opaque":
      return undefined;
  }
};

/**
 * The properties a condition can check for entities of any of the given types, by title: those the entities table
 * filters as a single number, text, date, true/false or status.
 */
export const getEntityProperties = (
  ontology: ConditionOntology,
  entityTypeIds: VersionedUrl[],
): EntityProperty[] => {
  const properties = new Map<BaseUrl, EntityProperty>();

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
      const entityProperty = toEntityProperty(property, ontology);

      if (entityProperty && !properties.has(entityProperty.baseUrl)) {
        properties.set(entityProperty.baseUrl, entityProperty);
      }
    }
  }

  return [...properties.values()].sort((left, right) =>
    left.title.localeCompare(right.title),
  );
};

/**
 * The properties a Find entities condition can be on for entities of any of the given types, by title: a single status,
 * or a single text whose latest data type is a date.
 */
export const getConditionProperties = (
  ontology: ConditionOntology,
  entityTypeIds: VersionedUrl[],
): ConditionProperty[] =>
  getEntityProperties(ontology, entityTypeIds).flatMap(
    ({ baseUrl, title, valueKind }): ConditionProperty[] => {
      if (valueKind.kind === "Date") {
        return [{ baseUrl, title, valueKind: { kind: "date" } }];
      }

      return valueKind.kind === "Text" && valueKind.options
        ? [
            {
              baseUrl,
              title,
              valueKind: { kind: "status", options: valueKind.options },
            },
          ]
        : [];
    },
  );
