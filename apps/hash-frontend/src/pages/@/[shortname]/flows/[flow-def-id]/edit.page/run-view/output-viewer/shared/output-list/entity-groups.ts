import { typedEntries } from "@local/advanced-types/typed-entries";

import type {
  BaseUrl,
  ClosedMultiEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesDefinitions } from "@local/hash-graph-sdk/ontology";

/** Entities of a list that have the same types, a table's worth. */
export type EntityGroup = {
  key: string;
  /** None for the entities that couldn't be loaded. */
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]] | null;
  /** The entities' positions in the list, in its order. */
  indexes: number[];
};

/**
 * A list's entities grouped by the types they have, in the order each first appears in the list, and those that
 * couldn't be loaded last. An entity of two types is grouped with the others of both, not with either.
 */
export const groupByType = (
  entities: (HashEntity | undefined)[],
): EntityGroup[] => {
  const groups = new Map<string, EntityGroup>();
  const missing: number[] = [];

  for (const [index, entity] of entities.entries()) {
    if (!entity) {
      missing.push(index);
      continue;
    }

    const { entityTypeIds } = entity.metadata;
    const key = [...entityTypeIds].sort().join(" ");
    const group = groups.get(key);

    if (group) {
      group.indexes.push(index);
    } else {
      groups.set(key, { key, entityTypeIds, indexes: [index] });
    }
  }

  return missing.length > 0
    ? [
        ...groups.values(),
        { key: "missing", entityTypeIds: null, indexes: missing },
      ]
    : [...groups.values()];
};

/** What a group's entities are, in the plural where the type says it, e.g. "Suppliers". */
export const getGroupLabel = (closedType: ClosedMultiEntityType) =>
  closedType.allOf
    .map(({ title, titlePlural }) => titlePlural ?? title)
    .join(", ");

/** One of a table's columns after the entity's name: a property of the entities' type. */
export type PropertyColumn = { baseUrl: BaseUrl; title: string };

/** A table's property columns: each of the type's properties that any of its entities has, in the type's order. */
export const getPropertyColumns = (
  closedType: ClosedMultiEntityType,
  definitions: ClosedMultiEntityTypesDefinitions,
  entities: HashEntity[],
): PropertyColumn[] =>
  typedEntries(closedType.properties).flatMap(([baseUrl, schema]) => {
    if (!entities.some(({ properties }) => properties[baseUrl] !== undefined)) {
      return [];
    }

    const propertyTypeId = "$ref" in schema ? schema.$ref : schema.items.$ref;

    return [
      {
        baseUrl,
        title: definitions.propertyTypes[propertyTypeId]?.title ?? baseUrl,
      },
    ];
  });
