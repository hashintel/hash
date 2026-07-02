/**
 * Pure helpers for combining the type metadata of multiple result pages.
 *
 * Each page's response only carries the closed types / definitions referenced
 * by that page's entities, so displaying the union of pages requires the
 * union of their metadata too.
 */
import type { ClosedMultiEntityTypeMap } from "@local/hash-graph-client";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

const mergeInnerMaps = (
  base: Record<string, ClosedMultiEntityTypeMap> | undefined,
  next: Record<string, ClosedMultiEntityTypeMap> | undefined,
): Record<string, ClosedMultiEntityTypeMap> | undefined => {
  if (!base || !next) {
    return base ?? next;
  }

  const merged = { ...base };

  for (const [entityTypeId, map] of Object.entries(next)) {
    const existing = merged[entityTypeId];

    if (existing) {
      const inner = mergeInnerMaps(existing.inner, map.inner);

      // The key path to this node is the entity type combination it
      // describes, so the two schemas are equivalent -- keep the newer one.
      merged[entityTypeId] = inner
        ? { schema: map.schema, inner }
        : { schema: map.schema };
    } else {
      merged[entityTypeId] = map;
    }
  }

  return merged;
};

/**
 * Merges the nested closed multi-entity-type maps of several pages, so that
 * {@link getClosedMultiEntityTypeFromMap} resolves for every entity across
 * all of them. Branches are merged recursively: two pages may share a first
 * type but nest different second types under it.
 */
export const mergeClosedMultiEntityTypesRootMaps = (
  maps: ClosedMultiEntityTypesRootMap[],
): ClosedMultiEntityTypesRootMap => {
  if (maps.length === 1) {
    return maps[0]!;
  }

  return maps.reduce<ClosedMultiEntityTypesRootMap>(
    (merged, map) => mergeInnerMaps(merged, map) ?? {},
    {},
  );
};

/** Merges the data/property/entity type definition pools of several pages. */
export const mergeDefinitions = (
  definitionSets: ClosedMultiEntityTypesDefinitions[],
): ClosedMultiEntityTypesDefinitions => {
  if (definitionSets.length === 1) {
    return definitionSets[0]!;
  }

  const merged: ClosedMultiEntityTypesDefinitions = {
    dataTypes: {},
    entityTypes: {},
    propertyTypes: {},
  };

  for (const definitions of definitionSets) {
    Object.assign(merged.dataTypes, definitions.dataTypes);
    Object.assign(merged.entityTypes, definitions.entityTypes);
    Object.assign(merged.propertyTypes, definitions.propertyTypes);
  }

  return merged;
};
