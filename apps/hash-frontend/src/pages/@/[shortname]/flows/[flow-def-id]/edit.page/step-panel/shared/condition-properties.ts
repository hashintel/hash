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
 * Each property `toProperty` keeps for entities of any of the given types, by title. One type at a time: across several,
 * the first type whose property it keeps decides its shape, so a list or an unsupported version on one type doesn't
 * hide the value another has.
 */
const collectProperties = <
  Property extends { baseUrl: BaseUrl; title: string },
>(
  ontology: ConditionOntology,
  entityTypeIds: VersionedUrl[],
  toProperty: (property: FilterMetadataForProperty) => Property | undefined,
): Property[] => {
  const properties = new Map<BaseUrl, Property>();

  for (const entityTypeId of entityTypeIds) {
    for (const property of deriveFilterableProperties({
      dataTypes: ontology.dataTypes,
      entityTypeIds: [entityTypeId],
      entityTypeParentIds: ontology.entityTypeParentIds,
      entityTypes: ontology.entityTypes,
      propertyTypes: ontology.propertyTypes,
    })) {
      const kept = toProperty(property);

      if (kept && !properties.has(kept.baseUrl)) {
        properties.set(kept.baseUrl, kept);
      }
    }
  }

  return [...properties.values()].sort((left, right) =>
    left.title.localeCompare(right.title),
  );
};

/** The properties a condition can check: a single number, text, date, true/false or status. */
export const getEntityProperties = (
  ontology: ConditionOntology,
  entityTypeIds: VersionedUrl[],
): EntityProperty[] =>
  collectProperties(ontology, entityTypeIds, (property) =>
    toEntityProperty(property, ontology),
  );

/** The properties a Find entities condition can be on: a single status, or a single text whose latest data type is a date. */
export const getConditionProperties = (
  ontology: ConditionOntology,
  entityTypeIds: VersionedUrl[],
): ConditionProperty[] =>
  collectProperties(
    ontology,
    entityTypeIds,
    (property): ConditionProperty | undefined => {
      const entityProperty = toEntityProperty(property, ontology);

      if (!entityProperty) {
        return undefined;
      }

      const { valueKind } = entityProperty;

      if (valueKind.kind === "Date") {
        return { ...entityProperty, valueKind: { kind: "date" } };
      }

      return valueKind.kind === "Text" && valueKind.options
        ? {
            ...entityProperty,
            valueKind: { kind: "status", options: valueKind.options },
          }
        : undefined;
    },
  );
