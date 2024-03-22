import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferredEntityUpdateFailure,
  InferredEntityUpdateSuccess,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type {
  AccountId,
  Entity,
  EntityId,
  OwnedById,
} from "@local/hash-subgraph";
import {
  extractDraftIdFromEntityId,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-subgraph/stdlib";

import type { DereferencedEntityType } from "../dereference-entity-type";
import { extractErrorMessage } from "../shared/extract-validation-failure-details";
import { getEntityByFilter } from "../shared/get-entity-by-filter";
import { stringify } from "../stringify";
import { ensureTrailingSlash } from "./ensure-trailing-slash";
import type { ProposedEntityUpdatesByType } from "./generate-persist-entities-tools";

type StatusByTemporaryId<T> = Record<string, T>;

type EntityUpdateStatusMap = {
  updateSuccesses: StatusByTemporaryId<InferredEntityUpdateSuccess>;
  updateFailures: StatusByTemporaryId<InferredEntityUpdateFailure>;
};

export const updateEntities = async ({
  actorId,
  graphApiClient,
  log,
  proposedEntityUpdatesByType,
  requestedEntityTypes,
}: {
  actorId: AccountId;
  graphApiClient: GraphApi;
  log: (message: string) => void;
  proposedEntityUpdatesByType: ProposedEntityUpdatesByType;
  requestedEntityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  >;
  ownedById: OwnedById;
}): Promise<EntityUpdateStatusMap> => {
  const entityStatusMap: EntityUpdateStatusMap = {
    updateSuccesses: {},
    updateFailures: {},
  };

  await Promise.all(
    Object.values(requestedEntityTypes).map(async (entityType) => {
      const entityTypeId = entityType.schema.$id;

      const proposedUpdates = proposedEntityUpdatesByType[entityTypeId];

      await Promise.all(
        (proposedUpdates ?? []).map(async (proposedUpdate) => {
          const { entityId, properties, updateEntityId } = proposedUpdate;

          const proposedEntity = {
            entityId,
            properties: ensureTrailingSlash(properties),
          };

          let existingEntity: Entity | undefined = undefined;

          try {
            existingEntity = await getEntityByFilter({
              actorId,
              graphApiClient,
              filter: {
                all: [
                  { equal: [{ path: ["archived"] }, { parameter: false }] },
                  {
                    equal: [
                      { path: ["uuid"] },
                      {
                        parameter: extractEntityUuidFromEntityId(
                          updateEntityId as EntityId,
                        ),
                      },
                    ],
                  },
                  {
                    equal: [
                      { path: ["ownedById"] },
                      {
                        parameter: extractOwnedByIdFromEntityId(
                          updateEntityId as EntityId,
                        ),
                      },
                    ],
                  },
                ],
              },
            });

            if (!existingEntity) {
              throw new Error(
                `No entity with entityId ${updateEntityId} found.`,
              );
            }

            const newProperties = {
              ...existingEntity.properties,
              ...properties,
            };

            const draft = !!extractDraftIdFromEntityId(
              existingEntity.metadata.recordId.entityId,
            );

            await graphApiClient.validateEntity(actorId, {
              entityTypes: [entityTypeId],
              profile: draft ? "draft" : "full",
              properties,
              linkData: existingEntity.linkData,
            });

            const { data: updateEntityMetadata } =
              await graphApiClient.patchEntity(actorId, {
                draft,
                entityTypeIds: [entityTypeId],
                entityId: updateEntityId,
                properties: [
                  {
                    op: "replace",
                    path: "",
                    value: newProperties,
                  },
                ],
              });

            const metadata =
              mapGraphApiEntityMetadataToMetadata(updateEntityMetadata);

            entityStatusMap.updateSuccesses[proposedEntity.entityId] = {
              entityTypeId,
              entity: {
                ...existingEntity,
                properties: newProperties,
                metadata,
              },
              proposedEntity,
              operation: "update",
              status: "success",
            };
          } catch (err) {
            log(
              `Update of entity with temporary id ${
                proposedEntity.entityId
              } and entityId ${
                existingEntity?.metadata.recordId.entityId ?? "unknown"
              } failed with err: ${stringify(err)}}`,
            );

            const failureReason = `${extractErrorMessage(err)}.`;

            entityStatusMap.updateFailures[proposedEntity.entityId] = {
              entityTypeId,
              entity: existingEntity,
              proposedEntity,
              failureReason,
              operation: "update",
              status: "failure",
            };
          }
        }),
      );
    }),
  );

  return entityStatusMap;
};
