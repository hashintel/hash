import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferredEntityCreationFailure,
  InferredEntityCreationSuccess,
  InferredEntityMatchesExisting,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type {
  AccountId,
  Entity,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";
import isMatch from "lodash.ismatch";

import { logger } from "../../../shared/logger";
import {
  findExistingEntity,
  findExistingLinkEntity,
} from "../../shared/find-existing-entity";
import { stringify } from "../../shared/stringify";
import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
  UpdateCandidate,
} from "../inference-types";
import { extractErrorMessage } from "../shared/extract-validation-failure-details";
import { ensureTrailingSlash } from "./ensure-trailing-slash";
import type { ProposedEntityCreationsByType } from "./generate-persist-entities-tools";

type StatusByTemporaryId<T> = Record<number, T>;

type EntityStatusMap = {
  creationSuccesses: StatusByTemporaryId<InferredEntityCreationSuccess>;
  creationFailures: StatusByTemporaryId<InferredEntityCreationFailure>;
  updateCandidates: StatusByTemporaryId<UpdateCandidate>;
  unchangedEntities: StatusByTemporaryId<InferredEntityMatchesExisting>;
};

export const createEntities = async ({
  actorId,
  createAsDraft,
  graphApiClient,
  inferenceState,
  proposedEntitiesByType,
  requestedEntityTypes,
  ownedById,
}: {
  actorId: AccountId;
  createAsDraft: boolean;
  graphApiClient: GraphApi;
  inferenceState: InferenceState;
  proposedEntitiesByType: ProposedEntityCreationsByType;
  requestedEntityTypes: DereferencedEntityTypesByTypeId;
  ownedById: OwnedById;
}): Promise<EntityStatusMap> => {
  const nonLinkEntityTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => !isLink,
  );
  const linkTypes = Object.values(requestedEntityTypes).filter(
    ({ isLink }) => isLink,
  );

  const internalEntityStatusMap: EntityStatusMap = {
    creationSuccesses: {},
    creationFailures: {},
    updateCandidates: {},
    unchangedEntities: {},
  };

  const findPersistedEntity = (
    temporaryId: number,
  ): Entity | null | undefined =>
    internalEntityStatusMap.creationSuccesses[temporaryId]?.entity ??
    internalEntityStatusMap.updateCandidates[temporaryId]?.entity ??
    internalEntityStatusMap.unchangedEntities[temporaryId]?.entity ??
    inferenceState.resultsByTemporaryId[temporaryId]?.entity;

  await Promise.all(
    nonLinkEntityTypes.map(async (nonLinkType) => {
      const entityTypeId = nonLinkType.schema.$id;

      const proposedEntities = proposedEntitiesByType[entityTypeId];

      await Promise.all(
        (proposedEntities ?? []).map(async (proposedEntity) => {
          const possiblyOverdefinedProperties = ensureTrailingSlash(
            proposedEntity.properties ?? {},
          );

          /**
           * The AI tends to want to supply properties for entities even when they shouldn't have any,
           * so we set the property object to empty if the schema demands it.
           */
          const entityType = requestedEntityTypes[entityTypeId]!; // check beforehand
          const hasNoProperties =
            Object.keys(entityType.schema.properties).length === 0;
          const properties = hasNoProperties
            ? {}
            : possiblyOverdefinedProperties;

          if (hasNoProperties) {
            /**
             * This prevents the proposed entity's properties object causing problems elsewhere, as it isn't present on
             * the schema. Repeatedly advising the AI that it is providing a property not in the schema does not seem
             * to stop it from doing so.
             */
            logger.info(
              `Overwriting properties of entity with temporary id ${proposedEntity.entityId} to an empty object, as the target type has no properties`,
            );
            // eslint-disable-next-line no-param-reassign
            proposedEntity.properties = {};
          }

          const existingEntity = await findExistingEntity({
            actorId,
            graphApiClient,
            dereferencedEntityType: entityType.schema,
            ownedById,
            proposedEntity: {
              entityTypeId,
              properties,
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
              internalEntityStatusMap.updateCandidates[
                proposedEntity.entityId
              ] = {
                entity: existingEntity,
                proposedEntity,
                status: "update-candidate",
              };
            } else {
              logger.debug(
                `Proposed entity ${proposedEntity.entityId} exactly matches existing entity – continuing`,
              );
              internalEntityStatusMap.unchangedEntities[
                proposedEntity.entityId
              ] = {
                entity: existingEntity,
                entityTypeId,
                operation: "already-exists-as-proposed",
                proposedEntity,
                status: "success",
              };
            }
            return;
          }

          try {
            await graphApiClient.validateEntity(actorId, {
              entityTypes: [entityTypeId],
              profile: createAsDraft ? "draft" : "full",
              properties,
            });

            const { data: createdEntityMetadata } =
              await graphApiClient.createEntity(actorId, {
                draft: createAsDraft,
                entityTypeIds: [entityTypeId],
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

            internalEntityStatusMap.creationSuccesses[proposedEntity.entityId] =
              {
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
            logger.error(
              `Creation of entity id ${
                proposedEntity.entityId
              } failed with err: ${stringify(err)}`,
            );

            const failureReason = `${extractErrorMessage(err)}.`;

            internalEntityStatusMap.creationFailures[proposedEntity.entityId] =
              {
                entityTypeId,
                proposedEntity,
                failureReason,
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
          const properties = ensureTrailingSlash(
            proposedEntity.properties ?? {},
          );

          if (
            !(
              "sourceEntityId" in proposedEntity &&
              "targetEntityId" in proposedEntity
            )
          ) {
            const originalProposal =
              inferenceState.proposedEntitySummaries.find(
                (summary) => summary.entityId === proposedEntity.entityId,
              );
            internalEntityStatusMap.creationFailures[proposedEntity.entityId] =
              {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason: `Link entities must have both a sourceEntityId and a targetEntityId.${
                  originalProposal
                    ? `You originally proposed that entityId ${
                        proposedEntity.entityId
                      } should have sourceEntityId ${
                        originalProposal.sourceEntityId?.toString() ?? ""
                      } and targetEntityId ${
                        originalProposal.targetEntityId?.toString() ?? ""
                      }.`
                    : ""
                }`,
              };
            return;
          }

          const { sourceEntityId, targetEntityId } = proposedEntity;

          const sourceEntity = findPersistedEntity(sourceEntityId);

          if (!sourceEntity) {
            const sourceFailure =
              internalEntityStatusMap.creationFailures[sourceEntityId];

            if (!sourceFailure) {
              const sourceProposedEntity = Object.values(proposedEntitiesByType)
                .flat()
                .find((entity) => entity.entityId === sourceEntityId);

              const failureReason = sourceProposedEntity
                ? `source with temporaryId ${sourceEntityId} was proposed but not created, and no creation error is recorded`
                : `source with temporaryId ${sourceEntityId} not found in proposed entities`;

              internalEntityStatusMap.creationFailures[
                proposedEntity.entityId
              ] = {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason,
              };
              return;
            }

            internalEntityStatusMap.creationFailures[proposedEntity.entityId] =
              {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason: `Link entity could not be created – source with temporary id ${sourceEntityId} failed to be created with reason: ${sourceFailure.failureReason}`,
              };

            return;
          }

          const targetEntity = findPersistedEntity(targetEntityId);

          if (!targetEntity) {
            const targetFailure =
              internalEntityStatusMap.creationFailures[targetEntityId];

            if (!targetFailure) {
              const targetProposedEntity = Object.values(proposedEntitiesByType)
                .flat()
                .find((entity) => entity.entityId === targetEntityId);

              const failureReason = targetProposedEntity
                ? `target with temporaryId ${targetEntityId} was proposed but not created, and no creation error is recorded`
                : `target with temporaryId ${targetEntityId} not found in proposed entities`;

              internalEntityStatusMap.creationFailures[
                proposedEntity.entityId
              ] = {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason,
              };
              return;
            }

            internalEntityStatusMap.creationFailures[proposedEntity.entityId] =
              {
                entityTypeId,
                proposedEntity,
                operation: "create",
                status: "failure",
                failureReason: `Link entity could not be created – target with temporary id ${targetEntityId} failed to be created with reason: ${targetFailure.failureReason}`,
              };

            return;
          }

          const linkData: LinkData = {
            leftEntityId: sourceEntity.metadata.recordId.entityId,
            rightEntityId: targetEntity.metadata.recordId.entityId,
          };

          try {
            await graphApiClient.validateEntity(actorId, {
              entityTypes: [entityTypeId],
              profile: createAsDraft ? "draft" : "full",
              properties,
              linkData,
            });

            const existingLinkEntity = await findExistingLinkEntity({
              actorId,
              graphApiClient,
              linkData,
              ownedById,
            });

            if (existingLinkEntity) {
              /**
               * If we have an existing link entity, propose an update any of the proposed properties are different.
               * Otherwise, do nothing.
               */
              if (!isMatch(existingLinkEntity.properties, properties)) {
                internalEntityStatusMap.updateCandidates[
                  proposedEntity.entityId
                ] = {
                  entity: existingLinkEntity,
                  proposedEntity,
                  status: "update-candidate",
                };
              }
              logger.debug(
                `Proposed link entity ${proposedEntity.entityId} exactly matches existing entity – continuing`,
              );

              return;
            }

            const { data: createdEntityMetadata } =
              await graphApiClient.createEntity(actorId, {
                draft: createAsDraft,
                entityTypeIds: [entityTypeId],
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

            internalEntityStatusMap.creationSuccesses[proposedEntity.entityId] =
              {
                entityTypeId,
                entity: { linkData, metadata, properties },
                operation: "create",
                proposedEntity,
                status: "success",
              };
          } catch (err) {
            logger.error(
              `Creation of link entity id ${
                proposedEntity.entityId
              } failed with err: ${stringify(err)}`,
            );

            const failureReason = `${extractErrorMessage(err)}.`;

            internalEntityStatusMap.creationFailures[proposedEntity.entityId] =
              {
                entityTypeId,
                operation: "create",
                proposedEntity,
                status: "failure",
                failureReason,
              };
          }
        }),
      );
    }),
  );

  return internalEntityStatusMap;
};
