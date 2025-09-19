import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  EntityId,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
} from "@blockprotocol/type-system";
import {
  extractDraftIdFromEntityId,
  splitEntityId,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { GraphApi } from "@local/hash-graph-client";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-graph-sdk/subgraph";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { deduplicateSources } from "@local/hash-isomorphic-utils/provenance";
import isEqual from "lodash/isEqual.js";

import type { ExistingEntityForMatching } from "../../shared/match-existing-entity.js";

/**
 * @todo: move the primitive node helper methods from the Node API into a shared
 * package so that they can be used without importing from the Node API directly.
 *
 * @see https://linear.app/hash/issue/H-1458/move-primitive-node-api-helper-methods-into-shared-package-to-make
 */

export const getLatestEntityById = async (params: {
  graphApiClient: GraphApi;
  authentication: { actorId: ActorEntityUuid };
  entityId: EntityId;
  includeDrafts?: boolean;
}) => {
  const { graphApiClient, authentication, entityId } = params;

  const [webId, entityUuid] = splitEntityId(entityId);

  const response = await graphApiClient.queryEntitySubgraph(
    authentication.actorId,
    {
      filter: {
        all: [
          {
            equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
          },
          {
            equal: [{ path: ["webId"] }, { parameter: webId }],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: params.includeDrafts ?? false,
    },
  );

  const entitiesSubgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
    response.data.subgraph,
    authentication.actorId,
  );

  const [entity, ...unexpectedEntities] = getRoots(entitiesSubgraph);

  if (unexpectedEntities.length > 0) {
    throw new Error(
      `Critical: Latest entity with entityId ${entityId} returned more than one result.`,
    );
  }

  if (!entity) {
    throw new Error(
      `Critical: Entity with entityId ${entityId} doesn't exist or cannot be accessed by requesting user.`,
    );
  }

  return entity;
};

export const getEntityUpdate = <T extends PropertyObjectWithMetadata>({
  existingEntity,
  newPropertiesWithMetadata,
}: {
  existingEntity: ExistingEntityForMatching;
  newPropertiesWithMetadata: T;
}) => {
  const patchOperations: PropertyPatchOperation[] = [];

  let isExactMatch = true;

  for (const [key, propertyWithMetadata] of typedEntries(
    newPropertiesWithMetadata.value,
  )) {
    if (!existingEntity.properties[key]) {
      isExactMatch = false;
    }

    const newPropertySources =
      propertyWithMetadata.metadata?.provenance?.sources;

    const existingPropertySources =
      existingEntity.propertiesMetadata.value[key]?.metadata?.provenance
        ?.sources;

    let sourcesToApply = newPropertySources;

    /**
     * This equality check is comparing the value of the properties object on the existingEntity
     * with PropertyWithMetadata["value"] on the new input,
     * and will always return false for array or object values (because the first is the value only, the second contains metadata).
     * @todo H-3900: better handle property objects
     */
    if (isEqual(existingEntity.properties[key], propertyWithMetadata.value)) {
      /**
       * If the values are equal, we can merge the sources from the existing and new properties,
       * to capture the fact that we have now seen the value in multiple places.
       * This only works for primitive values (see comment above about isEqual check).
       */
      sourcesToApply = deduplicateSources([
        ...(existingPropertySources ?? []),
        ...(newPropertySources ?? []),
      ]);
    } else {
      isExactMatch = false;
    }

    const clonedProperty = JSON.parse(
      JSON.stringify(propertyWithMetadata),
    ) as typeof propertyWithMetadata;

    if (sourcesToApply?.length) {
      clonedProperty.metadata ??= {};
      clonedProperty.metadata.provenance ??= {};
      clonedProperty.metadata.provenance.sources = sourcesToApply;
    }

    patchOperations.push({
      op: existingEntity.properties[key] ? "replace" : "add",
      path: [key],
      /**
       * @todo H-3900: consider merging property objects (e.g. if existingEntity has one nested field defined)
       *   - the entire object will currently be overwritten with the new input.
       */
      property: clonedProperty,
    });
  }

  const existingEntityIsDraft = !!extractDraftIdFromEntityId(
    existingEntity.entityId,
  );

  return {
    existingEntityIsDraft,
    isExactMatch,
    patchOperations,
  };
};
