import {
  getBreadthFirstEntityTypesAndParents,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  BaseUrl,
  PropertyObjectWithMetadata,
  WebId,
} from "@blockprotocol/type-system";
import {
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  mustHaveAtLeastOne,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import {
  propertyObjectToPatches,
  queryEntitySubgraph,
} from "@local/hash-graph-sdk/entity";
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

import type { ImpureGraphContext } from "../../../context-types";
import { updateEntity } from "../../../knowledge/primitive/entity";
import type { MigrationState } from "../types";

export const upgradeWebEntities = async ({
  authentication,
  context,
  entityTypeBaseUrls,
  migrationState,
  migrateProperties,
  webId,
}: {
  authentication: { actorId: ActorEntityUuid };
  context: ImpureGraphContext<false, true>;
  entityTypeBaseUrls: BaseUrl[];
  migrationState: MigrationState;
  migrateProperties?: Record<
    BaseUrl,
    (
      previousProperties: PropertyObjectWithMetadata,
    ) => PropertyObjectWithMetadata
  >;
  webId: WebId;
}) => {
  const webBotAccountId = await getWebMachineId(context, authentication, {
    webId,
  }).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new Error(`Failed to get web bot account ID for web ID: ${webId}`);
    }
    return maybeMachineId;
  });

  const webBotAuthentication = { actorId: webBotAccountId as ActorEntityUuid };

  const { subgraph } = await queryEntitySubgraph(
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
              { path: ["webId"] },
              {
                parameter: webId,
              },
            ],
          },
        ],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        ...fullOntologyResolveDepths,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: true,
      includePermissions: false,
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
          compareOntologyTypeVersions(
            matchingTypeRecordId.version,
            newVersion,
          ) >= 0
        ) {
          continue;
        }

        const newEntityTypeId = versionedUrlFromComponents(
          baseUrlBeingUpgraded,
          newVersion,
        );

        const migratePropertiesFunction =
          migrateProperties?.[baseUrlBeingUpgraded];

        let updateAuthentication = webBotAuthentication;

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
         * We've determined the actor, now perform the update.
         */
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
      }
    }),
  );
};
