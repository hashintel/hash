import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  AllFilter,
  CosineDistanceFilter,
  GraphApi,
} from "@local/hash-graph-client";
import type {
  InferredEntityCreationFailure,
  InferredEntityCreationSuccess,
  InferredEntityMatchesExisting,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import { generateVersionedUrlMatchingFilter } from "@local/hash-isomorphic-utils/graph-queries";
import type {
  AccountId,
  BaseUrl,
  Entity,
  LinkData,
  OwnedById,
} from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { mapGraphApiEntityMetadataToMetadata } from "@local/hash-subgraph/stdlib";
import isMatch from "lodash.ismatch";

import { createEntityEmbeddings } from "../../shared/embeddings";
import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
  UpdateCandidate,
} from "../inference-types";
import { extractErrorMessage } from "../shared/extract-validation-failure-details";
import { getEntityByFilter } from "../shared/get-entity-by-filter";
import { stringify } from "../stringify";
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
  log,
  proposedEntitiesByType,
  requestedEntityTypes,
  ownedById,
}: {
  actorId: AccountId;
  createAsDraft: boolean;
  graphApiClient: GraphApi;
  inferenceState: InferenceState;
  log: (message: string) => void;
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
            log(
              `Overwriting properties of entity with temporary id ${proposedEntity.entityId} to an empty object, as the target type has no properties`,
            );
            // eslint-disable-next-line no-param-reassign
            proposedEntity.properties = {};
          }

          /**
           * Search for an existing entity that seems to semantically match the proposed entity, based on:
           * 1. The value for the label property, or other properties which are good candidates for unique identifying
           * an entity
           * 2. The entire entity properties object, if there is no match from (1)
           */

          /** We are going to need the embeddings in both cases, so create these first */
          const { embeddings } = await createEntityEmbeddings({
            entityProperties: properties,
            propertyTypes: Object.values(entityType.schema.properties).map(
              (propertySchema) => ({
                title:
                  "items" in propertySchema
                    ? propertySchema.items.title
                    : propertySchema.title,
                $id:
                  "items" in propertySchema
                    ? propertySchema.items.$id
                    : propertySchema.$id,
              }),
            ),
          });

          const existingEntityBaseAllFilter = [
            { equal: [{ path: ["archived"] }, { parameter: false }] },
            {
              equal: [
                { path: ["ownedById"] },
                {
                  parameter: ownedById,
                },
              ],
            },
            generateVersionedUrlMatchingFilter(entityTypeId),
          ] satisfies AllFilter["all"];

          const maximumSemanticDistance = 0.5;

          /**
           * First find suitable specific properties to match on
           */
          const labelProperty = entityType.schema.labelProperty;

          const propertyBaseUrlsToMatchOn: BaseUrl[] =
            labelProperty &&
            entityType.schema.properties[labelProperty] &&
            properties[labelProperty]
              ? [labelProperty]
              : [];

          const nameProperties = [
            "name",
            "legal name",
            "preferred name",
            "profile url",
            "shortname",
          ];
          for (const [key, schema] of typedEntries(
            entityType.schema.properties,
          )) {
            if (
              nameProperties.includes(
                "items" in schema
                  ? schema.items.title.toLowerCase()
                  : schema.title.toLowerCase(),
              ) &&
              properties[key]
            ) {
              propertyBaseUrlsToMatchOn.push(key);
            }
          }

          /** Create the filters for any of label or name-like property values */
          const semanticDistanceFilters: CosineDistanceFilter[] =
            propertyBaseUrlsToMatchOn
              .map((baseUrl) => {
                const foundEmbedding = embeddings.find(
                  (embedding) => embedding.property === baseUrl,
                )?.embedding;

                if (!foundEmbedding) {
                  log(
                    `Could not find embedding for property ${baseUrl} of entity with temporary id ${proposedEntity.entityId} – skipping`,
                  );
                  return null;
                }

                return {
                  cosineDistance: [
                    { path: ["embedding"] },
                    {
                      parameter: foundEmbedding,
                    },
                    { parameter: maximumSemanticDistance }, // starting point for a threshold that will get only values which are a semantic match
                  ],
                } satisfies CosineDistanceFilter;
              })
              .filter(
                <T>(filter: T): filter is NonNullable<T> => filter !== null,
              );

          let existingEntity: Entity | undefined;

          if (semanticDistanceFilters.length > 0) {
            existingEntity = await getEntityByFilter({
              actorId,
              graphApiClient,
              filter: {
                all: [
                  ...existingEntityBaseAllFilter,
                  {
                    any: semanticDistanceFilters,
                  },
                ],
              },
            });
          }

          if (!existingEntity) {
            // If we didn't find a match on individual properties, try matching on the entire properties object
            const propertyObjectEmbedding = embeddings.find(
              (embedding) => !embedding.property,
            );

            if (!propertyObjectEmbedding) {
              log(
                `Could not find embedding for properties object of entity with temporary id ${proposedEntity.entityId} – skipping`,
              );
            } else {
              existingEntity = await getEntityByFilter({
                actorId,
                graphApiClient,
                filter: {
                  all: [
                    ...existingEntityBaseAllFilter,
                    {
                      cosineDistance: [
                        { path: ["embedding"] },
                        {
                          parameter: propertyObjectEmbedding.embedding,
                        },
                        { parameter: maximumSemanticDistance },
                      ],
                    },
                  ],
                },
              });
            }
          }

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
              log(
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
            log(
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
                failureReason: `Link entities must have both a sourceEntityId and a targetEntityId.${originalProposal ? `You originally proposed that entityId ${proposedEntity.entityId} should have sourceEntityId ${originalProposal.sourceEntityId?.toString() ?? ""} and targetEntityId ${originalProposal.targetEntityId?.toString() ?? ""}.` : ""}`,
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

            const existingLinkEntity = await getEntityByFilter({
              actorId,
              graphApiClient,
              filter: {
                all: [
                  { equal: [{ path: ["archived"] }, { parameter: false }] },
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
                internalEntityStatusMap.updateCandidates[
                  proposedEntity.entityId
                ] = {
                  entity: existingLinkEntity,
                  proposedEntity,
                  status: "update-candidate",
                };
              }
              log(
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
            log(
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
