import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import type { Entity, GraphApi } from "@local/hash-graph-client";
import type {
  InferredEntityCreationFailure,
  InferredEntityCreationSuccess,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/temporal-types";
import type {
  AccountId,
  EntityId,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-subgraph/stdlib";
import isMatch from "lodash.ismatch";

import type { DereferencedEntityType } from "./dereference-entity-type";
import type { ProposedEntityCreationsByType } from "./generate-tools";
import { getEntityByFilter } from "./get-entity-by-filter";

type UpdateCandidate = {
  existingEntity: Entity;
  proposedEntity: ProposedEntity;
};

type StatusByTemporaryId<T> = Record<number, T>;

type EntityStatusMap = {
  creationSuccesses: StatusByTemporaryId<InferredEntityCreationSuccess>;
  creationFailures: StatusByTemporaryId<InferredEntityCreationFailure>;
  updateCandidates: StatusByTemporaryId<UpdateCandidate>;
  unchangedEntities: StatusByTemporaryId<UpdateCandidate>;
};

export const createEntities = async ({
  actorId,
  createAsDraft,
  graphApiClient,
  log,
  proposedEntitiesByType,
  requestedEntityTypes,
  ownedById,
}: {
  actorId: AccountId;
  createAsDraft: boolean;
  graphApiClient: GraphApi;
  log: (message: string) => void;
  proposedEntitiesByType: ProposedEntityCreationsByType;
  requestedEntityTypes: Record<
    VersionedUrl,
    { isLink: boolean; schema: DereferencedEntityType }
  >;
  ownedById: OwnedById;
}): Promise<EntityStatusMap> => {
  const nonLinkEntityTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => !isLink,
  );
  const linkTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => isLink,
  );

  const entityStatusMap: EntityStatusMap = {
    creationSuccesses: {},
    creationFailures: {},
    updateCandidates: {},
    unchangedEntities: {},
  };

  await Promise.all(
    nonLinkEntityTypes.map(async (nonLinkType) => {
      const entityTypeId = nonLinkType.schema.$id;

      const proposedEntities = proposedEntitiesByType[entityTypeId];

      await Promise.all(
        (proposedEntities ?? []).map(async (proposedEntity) => {
          const { properties = {} } = proposedEntity;

          const nameProperties = ["name", "display-name", "preferred-name"];
          const propertyKeysToMatchOn = typedKeys(properties).filter((key) =>
            nameProperties.includes(
              // capture the last part of the path, e.g. /@example/property-type/name/ -> name
              key.match(/([^/]+)\/$/)?.[1] ?? "",
            ),
          );

          if (propertyKeysToMatchOn.length > 0) {
            const existingEntity = await getEntityByFilter({
              actorId,
              graphApiClient,
              filter: {
                all: [
                  {
                    any: propertyKeysToMatchOn.map((key) => ({
                      equal: [
                        { path: ["properties", key] },
                        { parameter: properties[key] },
                      ],
                    })),
                  },
                  {
                    equal: [
                      { path: ["ownedById"] },
                      {
                        parameter: ownedById,
                      },
                    ],
                  },
                ],
              },
            });

            if (existingEntity) {
              /**
               * If we have an existing entity, propose an update any of the proposed properties are different.
               * Otherwise, do nothing.
               */
              if (
                !isMatch(
                  existingEntity.properties,
                  proposedEntity.properties ?? {},
                )
              ) {
                entityStatusMap.updateCandidates[proposedEntity.entityId] = {
                  existingEntity,
                  proposedEntity,
                };
              } else {
                entityStatusMap.unchangedEntities[proposedEntity.entityId] = {
                  existingEntity,
                  proposedEntity,
                };
              }
              return;
            }
          }

          try {
            await graphApiClient.validateEntity(actorId, {
              draft: createAsDraft,
              entityTypeId,
              operations: ["all"],
              properties,
            });

            const { data: createdEntityMetadata } =
              await graphApiClient.createEntity(actorId, {
                draft: createAsDraft,
                entityTypeId,
                ownedById,
                properties,
                relationships: [
                  {
                    relation: "setting",
                    subject: {
                      kind: "setting",
                      subjectId: "administratorFromWeb",
                    },
                  },
                  {
                    relation: "setting",
                    subject: { kind: "setting", subjectId: "updateFromWeb" },
                  },
                  {
                    relation: "setting",
                    subject: { kind: "setting", subjectId: "viewFromWeb" },
                  },
                ],
              });

            const metadata = mapGraphApiEntityMetadataToMetadata(
              createdEntityMetadata,
            );

            entityStatusMap.creationSuccesses[proposedEntity.entityId] = {
              entity: {
                metadata,
                properties,
              },
              entityTypeId,
              proposedEntity,
              operation: "create",
              status: "success",
            };
          } catch (err) {
            log(
              `Creation of entity id ${
                proposedEntity.entityId
              } failed with err: ${JSON.stringify(err, undefined, 2)}`,
            );

            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              proposedEntity,
              failureReason: (err as Error).message,
              operation: "create",
              status: "failure",
            };
          }
        }),
      );
    }),
  );

  await Promise.all(
    linkTypes.map(async (linkType) => {
      const entityTypeId = linkType.schema.$id;

      const proposedEntities = proposedEntitiesByType[entityTypeId];

      await Promise.all(
        (proposedEntities ?? []).map(async (proposedEntity) => {
          const { properties = {} } = proposedEntity;

          if (
            !(
              "sourceEntityId" in proposedEntity &&
              "targetEntityId" in proposedEntity
            )
          ) {
            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              proposedEntity,
              operation: "create",
              status: "failure",
              failureReason:
                "Link entities must have both a sourceEntityId and a targetEntityId.",
            };
            return;
          }

          const { sourceEntityId, targetEntityId } = proposedEntity;

          const sourceEntity =
            entityStatusMap.creationSuccesses[sourceEntityId]?.entity ??
            entityStatusMap.updateCandidates[sourceEntityId]?.existingEntity ??
            entityStatusMap.unchangedEntities[sourceEntityId]?.existingEntity;

          if (!sourceEntity) {
            const sourceFailure =
              entityStatusMap.creationFailures[sourceEntityId];

            if (!sourceFailure) {
              const sourceProposedEntity = Object.values(proposedEntitiesByType)
                .flat()
                .find((entity) => entity.entityId === sourceEntityId);

              const failureReason = sourceProposedEntity
                ? `source with temporaryId ${sourceEntityId} was proposed but not created, and no creation error is recorded`
                : `source with temporaryId ${sourceEntityId} not found in proposed entities`;

              entityStatusMap.creationFailures[proposedEntity.entityId] = {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason,
              };
              return;
            }

            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              proposedEntity,
              operation: "create",
              status: "failure",
              failureReason: `Link entity could not be created – source with temporary id ${sourceEntityId} failed to be created with reason: ${sourceFailure.failureReason}`,
            };

            return;
          }

          const targetEntity =
            entityStatusMap.creationSuccesses[targetEntityId]?.entity ??
            entityStatusMap.updateCandidates[targetEntityId]?.existingEntity ??
            entityStatusMap.unchangedEntities[targetEntityId]?.existingEntity;

          if (!targetEntity) {
            const targetFailure =
              entityStatusMap.creationFailures[targetEntityId];

            if (!targetFailure) {
              const targetProposedEntity = Object.values(proposedEntitiesByType)
                .flat()
                .find((entity) => entity.entityId === targetEntityId);

              const failureReason = targetProposedEntity
                ? `target with temporaryId ${targetEntityId} was proposed but not created, and no creation error is recorded`
                : `target with temporaryId ${targetEntityId} not found in proposed entities`;

              entityStatusMap.creationFailures[proposedEntity.entityId] = {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason,
              };
              return;
            }

            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              proposedEntity,
              operation: "create",
              status: "failure",
              failureReason: `Link entity could not be created – target with temporary id ${targetEntityId} failed to be created with reason: ${targetFailure.failureReason}`,
            };

            return;
          }

          const linkData: LinkData = {
            leftEntityId: sourceEntity.metadata.recordId.entityId as EntityId,
            rightEntityId: targetEntity.metadata.recordId.entityId as EntityId,
          };

          try {
            await graphApiClient.validateEntity(actorId, {
              draft: createAsDraft,
              entityTypeId,
              operations: ["all"],
              linkData,
              properties,
            });

            const existingLinkEntity = await getEntityByFilter({
              actorId,
              graphApiClient,
              filter: {
                all: [
                  {
                    equal: [
                      {
                        path: ["leftEntity", "ownedById"],
                      },
                      {
                        parameter: extractOwnedByIdFromEntityId(
                          linkData.leftEntityId,
                        ),
                      },
                    ],
                  },
                  {
                    equal: [
                      {
                        path: ["leftEntity", "uuid"],
                      },
                      {
                        parameter: extractEntityUuidFromEntityId(
                          linkData.leftEntityId,
                        ),
                      },
                    ],
                  },
                  {
                    equal: [
                      {
                        path: ["rightEntity", "ownedById"],
                      },
                      {
                        parameter: extractOwnedByIdFromEntityId(
                          linkData.rightEntityId,
                        ),
                      },
                    ],
                  },
                  {
                    equal: [
                      {
                        path: ["rightEntity", "uuid"],
                      },
                      {
                        parameter: extractEntityUuidFromEntityId(
                          linkData.rightEntityId,
                        ),
                      },
                    ],
                  },
                ],
              },
            });

            if (existingLinkEntity) {
              /**
               * If we have an existing link entity, propose an update any of the proposed properties are different.
               * Otherwise, do nothing.
               */
              if (!isMatch(existingLinkEntity.properties, properties)) {
                entityStatusMap.updateCandidates[proposedEntity.entityId] = {
                  existingEntity: existingLinkEntity,
                  proposedEntity,
                };
              }

              return;
            }

            const { data: createdEntityMetadata } =
              await graphApiClient.createEntity(actorId, {
                draft: createAsDraft,
                entityTypeId,
                linkData,
                ownedById,
                properties,
                relationships: [
                  {
                    relation: "setting",
                    subject: {
                      kind: "setting",
                      subjectId: "administratorFromWeb",
                    },
                  },
                  {
                    relation: "setting",
                    subject: { kind: "setting", subjectId: "updateFromWeb" },
                  },
                  {
                    relation: "setting",
                    subject: { kind: "setting", subjectId: "viewFromWeb" },
                  },
                ],
              });

            const metadata = mapGraphApiEntityMetadataToMetadata(
              createdEntityMetadata,
            );

            entityStatusMap.creationSuccesses[proposedEntity.entityId] = {
              entityTypeId,
              entity: { linkData, metadata, properties },
              operation: "create",
              proposedEntity,
              status: "success",
            };
          } catch (err) {
            log(
              `Creation of link entity id ${
                proposedEntity.entityId
              } failed with err: ${JSON.stringify(err, undefined, 2)}`,
            );

            entityStatusMap.creationFailures[proposedEntity.entityId] = {
              entityTypeId,
              operation: "create",
              proposedEntity,
              status: "failure",
              failureReason: (err as Error).message,
            };
          }
        }),
      );
    }),
  );

  return entityStatusMap;
};
