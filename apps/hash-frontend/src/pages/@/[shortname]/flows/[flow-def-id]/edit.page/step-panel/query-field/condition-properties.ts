import { typedEntries } from "@local/advanced-types/typed-entries";

import type { ConditionValueKind } from "./query-form";
import type {
  BaseUrl,
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  SingleValueConstraints,
  VersionedUrl,
} from "@blockprotocol/type-system";

/** A property a condition can be on: one whose value is a date or a status. */
export type ConditionProperty = {
  baseUrl: BaseUrl;
  title: string;
  valueKind: ConditionValueKind;
};

/** The kind of value a single set of constraints allows: a date, a status (text that is one of a fixed set), or neither. */
const getConstrainedValueKind = (
  constraints: SingleValueConstraints | undefined,
): ConditionValueKind | undefined => {
  if (!constraints) {
    return undefined;
  }

  if ("format" in constraints && constraints.format === "date") {
    return { kind: "date" };
  }

  if (
    "enum" in constraints &&
    constraints.enum.length > 0 &&
    constraints.enum.every((option) => typeof option === "string")
  ) {
    return { kind: "status", options: constraints.enum };
  }

  return undefined;
};

/**
 * The kind of value of a data type, from its own constraints or those it inherits: a date, a status, or `undefined`
 * for any other, including a type that allows several sets of constraints.
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

  if ("anyOf" in schema) {
    return schema.anyOf.length === 1
      ? getConstrainedValueKind(schema.anyOf[0])
      : undefined;
  }

  const own = getConstrainedValueKind(schema);

  if (own) {
    return own;
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
 * types or their parents have as a single value, not a list, by title.
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

  const entityTypesById = new Map(
    entityTypes.map((entityType) => [entityType.schema.$id, entityType]),
  );
  const found = new Map<BaseUrl, ConditionProperty>();

  for (const entityType of latestEntityTypes) {
    if (
      entityTypeBaseUrls.length > 0 &&
      !entityTypeBaseUrls.includes(entityType.metadata.recordId.baseUrl)
    ) {
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
