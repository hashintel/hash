import { typedEntries } from "@local/advanced-types/typed-entries";

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

/**
 * The kind of value of a data type, from its own constraints or those it inherits: a date, a status (text that is one
 * of a fixed set), or `undefined` for any other.
 */
const getValueKind = (
  dataTypeId: VersionedUrl,
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>,
  seen = new Set<VersionedUrl>(),
): ConditionValueKind | undefined => {
  const schema = dataTypes[dataTypeId]?.schema;

  if (!schema || seen.has(dataTypeId)) {
    return undefined;
  }

  seen.add(dataTypeId);

  if ("format" in schema && schema.format === "date") {
    return { kind: "date" };
  }

  if (
    "enum" in schema &&
    schema.enum.every((option) => typeof option === "string")
  ) {
    return { kind: "status", options: schema.enum };
  }

  for (const { $ref } of schema.allOf ?? []) {
    const inherited = getValueKind($ref, dataTypes, seen);

    if (inherited) {
      return inherited;
    }
  }

  return undefined;
};

/** Every property, by base URL, whose value is a single date or status, from the latest version of each. */
export const getConditionProperties = ({
  latestPropertyTypes,
  dataTypes,
}: {
  latestPropertyTypes: PropertyTypeWithMetadata[];
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>;
}) => {
  const properties = new Map<BaseUrl, ConditionProperty>();

  for (const { schema, metadata } of latestPropertyTypes) {
    const [only, ...others] = schema.oneOf;
    const valueKind =
      others.length === 0 && "$ref" in only
        ? getValueKind(only.$ref, dataTypes)
        : undefined;

    if (valueKind) {
      properties.set(metadata.recordId.baseUrl, {
        baseUrl: metadata.recordId.baseUrl,
        title: schema.title,
        valueKind,
      });
    }
  }

  return properties;
};

/**
 * The properties a condition can be on for entities of the given types, or of any type if none are given: those the
 * types or their parents have as a single value, by title.
 */
export const getPropertiesOfTypes = ({
  conditionProperties,
  entityTypeBaseUrls,
  latestEntityTypes,
  entityTypes,
  entityTypeParentIds,
}: {
  conditionProperties: Map<BaseUrl, ConditionProperty>;
  entityTypeBaseUrls: BaseUrl[];
  latestEntityTypes: EntityTypeWithMetadata[];
  entityTypes: EntityTypeWithMetadata[];
  entityTypeParentIds: Record<VersionedUrl, VersionedUrl[]>;
}): ConditionProperty[] => {
  const byTitle = (properties: Iterable<ConditionProperty>) =>
    [...properties].sort((left, right) =>
      left.title.localeCompare(right.title),
    );

  if (entityTypeBaseUrls.length === 0) {
    return byTitle(conditionProperties.values());
  }

  const entityTypesById = new Map(
    entityTypes.map((entityType) => [entityType.schema.$id, entityType]),
  );
  const found = new Map<BaseUrl, ConditionProperty>();

  for (const entityType of latestEntityTypes) {
    if (!entityTypeBaseUrls.includes(entityType.metadata.recordId.baseUrl)) {
      continue;
    }

    for (const typeId of [
      entityType.schema.$id,
      ...(entityTypeParentIds[entityType.schema.$id] ?? []),
    ]) {
      for (const [baseUrl, propertySchema] of typedEntries(
        entityTypesById.get(typeId)?.schema.properties ?? {},
      )) {
        const property = conditionProperties.get(baseUrl);

        if (property && "$ref" in propertySchema) {
          found.set(baseUrl, property);
        }
      }
    }
  }

  return byTitle(found.values());
};
