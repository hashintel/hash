import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferredEntityUpdateFailure,
  InferredEntityUpdateSuccess,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  AccountId,
  Entity,
  EntityId,
  OwnedById,
} from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";

import { logger } from "../../../shared/logger";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import { getEntityByFilter } from "../../shared/get-entity-by-filter";
import { stringify } from "../../shared/stringify";
import { extractErrorMessage } from "../shared/extract-validation-failure-details";
import { ensureTrailingSlash } from "./ensure-trailing-slash";
import type { ProposedEntityUpdatesByType } from "./generate-persist-entities-tools";

type StatusByTemporaryId<T> = Record<string, T>;

type EntityUpdateStatusMap = {
  updateSuccesses: StatusByTemporaryId<InferredEntityUpdateSuccess>;
  updateFailures: StatusByTemporaryId<InferredEntityUpdateFailure>;
};

export const updateEntities = async ({
  actorId,
  createAsDraft,
  graphApiClient,
  proposedEntityUpdatesByType,
  requestedEntityTypes,
}: {
  actorId: AccountId;
  createAsDraft: boolean;
  graphApiClient: GraphApi;
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

            await graphApiClient.validateEntity(actorId, {
              entityTypes: [entityTypeId],
              profile: createAsDraft ? "draft" : "full",
              properties,
              linkData: existingEntity.linkData,
            });

            const { data: updateEntityMetadata } =
              await graphApiClient.patchEntity(actorId, {
                draft: createAsDraft,
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
            logger.error(
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
