import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { AccountId } from "@local/hash-subgraph";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-subgraph/stdlib";

import { dereferenceEntityType } from "./infer-entities/dereference-entity-type";
import type { DereferencedEntityTypesByTypeId } from "./infer-entities/inference-types";

export const getDereferencedEntityTypesActivity = async (params: {
  entityTypeIds: VersionedUrl[];
  graphApiClient: GraphApi;
  actorId: AccountId;
}): Promise<DereferencedEntityTypesByTypeId> => {
  const { graphApiClient, entityTypeIds, actorId } = params;

  /** Fetch the full schemas for the requested entity types */
  const entityTypes: DereferencedEntityTypesByTypeId = {};

  const { data: entityTypesSubgraph } =
    await graphApiClient.getEntityTypesByQuery(actorId, {
      filter: {
        any: entityTypeIds.map((entityTypeId) => ({
          equal: [{ path: ["versionedUrl"] }, { parameter: entityTypeId }],
        })),
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        constrainsValuesOn: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        inheritsFrom: { outgoing: 255 },
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    });

  for (const entityTypeId of entityTypeIds) {
    entityTypes[entityTypeId] = dereferenceEntityType(
      entityTypeId,
      mapGraphApiSubgraphToSubgraph(entityTypesSubgraph),
    );
  }

  const unusableTypeIds = entityTypeIds.filter((entityTypeId) => {
    const details = entityTypes[entityTypeId];
    if (!details) {
      return true;
    }

    const { isLink } = details;

    if (!isLink) {
      /**
       * If it's not a link we assume it can be satisfied.
       * @todo consider checking if it has required links (minItems > 1) which cannot be satisfied
       */
      return false;
    }

    /**
     * If this is a link type, only search for it if it can be used, given the other types of entities being sought
     */
    const linkCanBeSatisfied = Object.values(entityTypes).some((option) =>
      typedEntries(option.schema.links ?? {}).some(
        ([linkTypeId, targetSchema]) =>
          // It must exist as a potential link on at least one of the other entity types being sought...
          linkTypeId === entityTypeId &&
          // ...and that link must not have destination constraints which cannot be met
          !(
            "oneOf" in targetSchema.items &&
            !targetSchema.items.oneOf.some(
              (targetOption) => entityTypes[targetOption.$ref],
            )
          ),
      ),
    );

    return !linkCanBeSatisfied;
  });

  for (const unusableTypeId of unusableTypeIds) {
    delete entityTypes[unusableTypeId];
  }

  return entityTypes;
};
