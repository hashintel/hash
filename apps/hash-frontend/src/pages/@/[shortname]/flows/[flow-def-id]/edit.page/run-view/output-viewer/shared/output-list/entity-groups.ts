import { typedEntries } from "@local/advanced-types/typed-entries";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

import { getTypeKey } from "../../../shared/run-entities";

import type {
  BaseUrl,
  ClosedMultiEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesDefinitions } from "@local/hash-graph-sdk/ontology";

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
    const key = getTypeKey(entity);
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

/** E.g. "Suppliers", in the plural where the type gives one. */
export const getGroupLabel = (closedType: ClosedMultiEntityType) =>
  closedType.allOf
    .map(({ title, titlePlural }) => titlePlural ?? title)
    .join(", ");

/**
 * A table's property columns: each of the type's properties that any of its entities has, but none that only repeats
 * their names, which the table shows first. By title, as in HASH's entities table: a type's properties come in no
 * fixed order.
 */
export const getPropertyColumns = (
  closedType: ClosedMultiEntityType,
  definitions: ClosedMultiEntityTypesDefinitions,
  entities: HashEntity[],
): { baseUrl: BaseUrl; title: string }[] => {
  const names = entities.map((entity) =>
    generateEntityLabel(closedType, entity),
  );

  return typedEntries(closedType.properties)
    .flatMap(([baseUrl, schema]) => {
      if (
        entities.every(
          ({ properties }, index) =>
            properties[baseUrl] === undefined ||
            stringifyPropertyValue(properties[baseUrl]) === names[index],
        )
      ) {
        return [];
      }

      const propertyTypeId = "$ref" in schema ? schema.$ref : schema.items.$ref;

      return [
        {
          baseUrl,
          title: definitions.propertyTypes[propertyTypeId]?.title ?? baseUrl,
        },
      ];
    })
    .sort((first, second) => first.title.localeCompare(second.title));
};
