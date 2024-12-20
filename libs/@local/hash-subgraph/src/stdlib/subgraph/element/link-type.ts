import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { typedKeys } from "@local/advanced-types/typed-entries";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";

import { linkEntityTypeUrl, type Subgraph } from "../../../main.js";
import {
  getEntityTypeAndParentsById,
  getEntityTypeById,
} from "./entity-type.js";

/**
 * Gets a map of all entityTypeIds for outgoing links from the entity type, to the full link entity types,
 * including from any parents in the entity type's inheritance chain.
 *
 * The subgraph must be a result of having queried for an entity type with sufficiently high depth
 * for constrainsLinksOn and inheritsFrom to contain all parent entity types and link entity types they reference.
 *
 * @param entityTypeId The entityTypeId to provide possible link types for
 * @param subgraph a subgraph which is assumed to contain all relevant link types
 *
 * @throws Error if the subgraph does not contain a link entity type or parent entity type relied on by the entity type
 *
 * @todo this is a good candidate for moving to somewhere shared, possibly @blockprotocol/graph's stdlib
 */
export const getPossibleLinkTypesForEntityType = (
  entityTypeId: VersionedUrl,
  subgraph: Subgraph,
) => {
  const linkEntityTypesMap = new Map<string, EntityTypeWithMetadata>();
  const entityTypeAndParents = getEntityTypeAndParentsById(
    subgraph,
    entityTypeId,
  );

  for (const entityType of entityTypeAndParents) {
    for (const linkId of typedKeys(entityType.schema.links ?? {})) {
      const linkEntityType = getEntityTypeById(subgraph, linkId);

      if (!linkEntityType) {
        throw new Error(
          `Could not find link entity type ${linkId} for entity type ${entityType.schema.$id}`,
        );
      }

      linkEntityTypesMap.set(linkId, linkEntityType);
    }
  }

  return linkEntityTypesMap;
};

export const isLinkEntityType = (
  entityTypeId: VersionedUrl,
  subgraph: Subgraph,
) => {
  const entityTypeWithAncestors = getEntityTypeAndParentsById(
    subgraph,
    entityTypeId,
  );

  return entityTypeWithAncestors.some(
    (entityType) => entityType.schema.$id === linkEntityTypeUrl,
  );
};
