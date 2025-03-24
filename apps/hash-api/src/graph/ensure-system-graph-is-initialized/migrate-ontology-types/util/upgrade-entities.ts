import type {
  ActorId,
  BaseUrl,
  OwnedById,
  PropertyObjectWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { mustHaveAtLeastOne } from "@blockprotocol/type-system";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { propertyObjectToPatches } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  fullOntologyResolveDepths,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  googleEntityTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  getBreadthFirstEntityTypesAndParents,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import {
  componentsFromVersionedUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/type-system-patch";

import type { ImpureGraphContext } from "../../../context-types";
import {
  getEntitySubgraphResponse,
  updateEntity,
} from "../../../knowledge/primitive/entity";
import { systemAccountId } from "../../../system-account";
import type { MigrationState } from "../types";

export const upgradeWebEntities = async ({
  authentication,
  context,
  entityTypeBaseUrls,
  migrationState,
  migrateProperties,
  webOwnedById,
}: {
  authentication: { actorId: ActorId };
  context: ImpureGraphContext<false, true>;
  entityTypeBaseUrls: BaseUrl[];
  migrationState: MigrationState;
  migrateProperties?: Record<
    BaseUrl,
    (
      previousProperties: PropertyObjectWithMetadata,
    ) => PropertyObjectWithMetadata
  >;
  webOwnedById: OwnedById;
}) => {
  const webBotAccountId = await getWebMachineActorId(context, authentication, {
    ownedById: webOwnedById,
  });

  const webBotAuthentication = { actorId: webBotAccountId };

  const { subgraph } = await getEntitySubgraphResponse(
    context,
    webBotAuthentication,
    {
      filter: {
        all: [
          {
            any: entityTypeBaseUrls.map((baseUrl) => ({
              all: [
                {
                  equal: [
                    { path: ["type(inheritanceDepth = 0)", "baseUrl"] },
                    { parameter: baseUrl },
                  ],
                },
                {
                  less: [
                    { path: ["type(inheritanceDepth = 0)", "version"] },
                    { parameter: migrationState.entityTypeVersions[baseUrl] },
                  ],
                },
              ],
            })),
          },
          {
            equal: [
              { path: ["ownedById"] },
              {
                parameter: webOwnedById,
              },
            ],
          },
        ],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        ...fullOntologyResolveDepths,
      },
      includeDrafts: true,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  const existingEntities = getRoots(subgraph);

  await Promise.all(
    existingEntities.map(async (entity) => {
      /**
       * the entity may have multiple types, and each of these may have multiple parents (direct or indirect).
       * we need to upgrade the entity if it belongs to any of the types that are being upgraded.
       */
      const allTypeRecordIdsForEntity = getBreadthFirstEntityTypesAndParents(
        subgraph,
        entity.metadata.entityTypeIds,
      ).map((type) => type.metadata.recordId);

      /**
       * Multiple upgrades may apply to an entity – we apply one at a time.
       */
      for (const baseUrlBeingUpgraded of entityTypeBaseUrls) {
        const newVersion =
          migrationState.entityTypeVersions[baseUrlBeingUpgraded];

        if (typeof newVersion === "undefined") {
          throw new Error(
            `Could not find the version for base URL ${baseUrlBeingUpgraded} in the migration state`,
          );
        }

        const matchingTypeRecordId = allTypeRecordIdsForEntity.find(
          (recordId) => recordId.baseUrl === baseUrlBeingUpgraded,
        );

        if (
          !matchingTypeRecordId ||
          matchingTypeRecordId.version >= newVersion
        ) {
          continue;
        }

        const newEntityTypeId = versionedUrlFromComponents(
          baseUrlBeingUpgraded,
          newVersion,
        );

        const currentEntityTypeId = versionedUrlFromComponents(
          baseUrlBeingUpgraded,
          matchingTypeRecordId.version,
        );

        const migratePropertiesFunction =
          migrateProperties?.[baseUrlBeingUpgraded];

        let updateAuthentication = webBotAuthentication;

        const temporaryEntityTypePermissionsGranted: Record<
          VersionedUrl,
          ActorId
        > = {};

        /**
         * Determine the actor that should update the entity.
         */
        if (
          baseUrlBeingUpgraded ===
            systemEntityTypes.userSecret.entityTypeBaseUrl ||
          baseUrlBeingUpgraded ===
            systemLinkEntityTypes.usesUserSecret.linkEntityTypeBaseUrl ||
          baseUrlBeingUpgraded === googleEntityTypes.account.entityTypeBaseUrl
        ) {
          /**
           * These entities are only editable by the bot that created them
           */
          updateAuthentication = {
            actorId: entity.metadata.provenance.createdById,
          };
        } else if (
          baseUrlBeingUpgraded === systemEntityTypes.machine.entityTypeBaseUrl
        ) {
          /**
           * If we are updating machine entities, we use the account ID
           * of the machine user as the actor for the update.
           */
          updateAuthentication = {
            /**
             * The account ID of the machine entity is the creator of its
             * first edition.
             */
            actorId: entity.metadata.provenance.createdById,
          };
        }

        /**
         * We may need to temporarily grant the actor the ability to instantiate entities of both the old and new entityTypeId,
         * because an actor cannot remove or add an entity type without being able to instantiate it.
         * Some entity types have their instantiator restricted, e.g. User, Org, so that they can only be created in special circumstances.
         * If the actor being used here doesn't already have permission we'll grant it and then remove it after the update.
         */
        for (const entityTypeId of [currentEntityTypeId, newEntityTypeId]) {
          const relationships = await context.graphApi
            .getEntityTypeAuthorizationRelationships(
              systemAccountId,
              entityTypeId,
            )
            .then(({ data }) => data);

          const relationAndSubject = {
            subject: {
              kind: "account",
              subjectId: updateAuthentication.actorId,
            },
            relation: "instantiator",
          } as const;

          if (
            !relationships.find(
              ({ subject, relation }) =>
                relation === "instantiator" &&
                ((subject.kind === "account" &&
                  subject.subjectId === updateAuthentication.actorId) ||
                  subject.kind === "public"),
            )
          ) {
            await context.graphApi.modifyEntityTypeAuthorizationRelationships(
              systemAccountId,
              [
                {
                  operation: "create",
                  resource: entityTypeId,
                  relationAndSubject,
                },
              ],
            );
            temporaryEntityTypePermissionsGranted[entityTypeId] =
              updateAuthentication.actorId;
          }
        }

        /**
         * We've determined the actor, now perform the update.
         */
        try {
          await updateEntity(context, updateAuthentication, {
            entity,
            entityTypeIds: mustHaveAtLeastOne(
              entity.metadata.entityTypeIds.map((entityTypeId) => {
                const { baseUrl, version } =
                  componentsFromVersionedUrl(entityTypeId);

                if (baseUrl === baseUrlBeingUpgraded) {
                  return newEntityTypeId;
                }

                return versionedUrlFromComponents(baseUrl, version);
              }),
            ),
            propertyPatches: migratePropertiesFunction
              ? propertyObjectToPatches(
                  migratePropertiesFunction(entity.propertiesWithMetadata),
                )
              : undefined,
          });
        } finally {
          for (const [entityTypeId, actorId] of Object.entries(
            temporaryEntityTypePermissionsGranted,
          )) {
            /**
             * If we updated a machine entity and granted its actor ID a
             * new permission, we need to remove the temporary permission.
             */
            await context.graphApi.modifyEntityTypeAuthorizationRelationships(
              systemAccountId,
              [
                {
                  operation: "delete",
                  resource: entityTypeId,
                  relationAndSubject: {
                    subject: {
                      kind: "account",
                      subjectId: actorId,
                    },
                    relation: "instantiator",
                  },
                },
              ],
            );
          }
        }
      }
    }),
  );
};
