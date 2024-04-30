import type { GraphApi } from "@local/hash-graph-client";
import { getSimplifiedActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FailedEntityProposal,
  PersistedEntities,
  PersistedEntity,
  ProposedEntityWithResolvedLinks,
} from "@local/hash-isomorphic-utils/flows/types";
import type { OwnedById } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";

import { persistEntityAction } from "./persist-entity-action";
import type { FlowActionActivity } from "./types";

export const persistEntitiesAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, graphApiClient, userAuthentication, flowEntityId }) => {
  const { draft, proposedEntities, webId } = getSimplifiedActionInputs({
    inputs,
    actionType: "persistEntities",
  });

  const ownedById = webId ?? (userAuthentication.actorId as OwnedById);

  /**
   * This assumes that there are no link entities which link to other link entities, which require being able to
   * create multiple entities at once in a single transaction (since they refer to each other).
   *
   * @todo handle links pointing to other links via creating many entities at once, unblocked by H-1178
   */
  const entitiesWithDependenciesSortedLast = [...proposedEntities].sort(
    (a, b) => {
      if (
        (a.sourceEntityId && b.sourceEntityId) ||
        (!a.sourceEntityId && !b.sourceEntityId)
      ) {
        return 0;
      }

      if (a.sourceEntityId) {
        return 1;
      }

      return -1;
    },
  );

  const failedEntitiesByLocalId: Record<string, FailedEntityProposal> = {};
  const persistedEntitiesByLocalId: Record<string, PersistedEntity> = {};

  /**
   * We could potentially parallelize the creation of (a) non-link entities and (b) link entities,
   * if performance of this function becomes an issue.
   */
  for (const unresolvedEntity of entitiesWithDependenciesSortedLast) {
    const { entityTypeId, properties, sourceEntityId, targetEntityId } =
      unresolvedEntity;

    const entityWithResolvedLinks: ProposedEntityWithResolvedLinks = {
      entityTypeId,
      properties,
    };

    if (sourceEntityId ?? targetEntityId) {
      if (!sourceEntityId || !targetEntityId) {
        failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
          proposedEntity: unresolvedEntity,
          message: `Expected both sourceEntityLocalId and targetEntityLocalId to be set, but got sourceEntityId='${JSON.stringify(sourceEntityId)}' and targetEntityId='${JSON.stringify(targetEntityId)}'`,
        };
        continue;
      }

      const leftEntityId =
        sourceEntityId.kind === "proposed-entity"
          ? persistedEntitiesByLocalId[sourceEntityId.localId]?.entity?.metadata
              .recordId.entityId
          : sourceEntityId.entityId;

      const rightEntityId =
        targetEntityId.kind === "proposed-entity"
          ? persistedEntitiesByLocalId[targetEntityId.localId]?.entity?.metadata
              .recordId.entityId
          : targetEntityId.entityId;

      if (!leftEntityId) {
        failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
          proposedEntity: unresolvedEntity,
          message: `Linked entity with sourceEntityId='${JSON.stringify(sourceEntityId)}' has not been successfully persisted`,
        };
        continue;
      }

      if (!rightEntityId) {
        failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
          proposedEntity: unresolvedEntity,
          message: `Linked entity with targetEntityId='${JSON.stringify(targetEntityId)}' has not been successfully persisted`,
        };
        continue;
      }

      entityWithResolvedLinks.linkData = { leftEntityId, rightEntityId };
    }

    const persistedEntityOutputs = await persistEntityAction({
      inputs: [
        {
          inputName: "draft",
          payload: { kind: "Boolean", value: draft ?? false },
        },
        {
          inputName: "proposedEntityWithResolvedLinks",
          payload: {
            kind: "ProposedEntityWithResolvedLinks",
            value: entityWithResolvedLinks,
          },
        },
        {
          inputName: "webId",
          payload: { kind: "WebId", value: ownedById },
        },
      ],
      graphApiClient,
      userAuthentication,
      flowEntityId,
    });

    const output = persistedEntityOutputs.contents[0]?.outputs?.[0]?.payload;

    if (output && output.kind !== "PersistedEntity") {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        proposedEntity: unresolvedEntity,
        message: `Unexpected output kind ${output.kind}`,
      };
      continue;
    }

    if (Array.isArray(output?.value)) {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        proposedEntity: unresolvedEntity,
        message: `Expected a single persisted entity, but received ${!output ? "no outputs" : `an array of length ${output.value.length}`}`,
      };
      continue;
    }

    if (persistedEntityOutputs.code !== StatusCode.Ok) {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        ...(output?.value ?? {}),
        proposedEntity: entityWithResolvedLinks,
        message: `${persistedEntityOutputs.code}: ${persistedEntityOutputs.message ?? `no further details available`}`,
      };
      continue;
    }

    if (!output) {
      failedEntitiesByLocalId[unresolvedEntity.localEntityId] = {
        proposedEntity: unresolvedEntity,
        message: `No outputs returned when attempting to persist entity`,
      };
      continue;
    }

    persistedEntitiesByLocalId[unresolvedEntity.localEntityId] = output.value;
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "persistedEntities",
            payload: {
              kind: "PersistedEntities",
              value: {
                persistedEntities: Object.values(persistedEntitiesByLocalId),
                failedEntityProposals: Object.values(failedEntitiesByLocalId),
              } satisfies PersistedEntities,
            },
          },
        ],
      },
    ],
  };
};
