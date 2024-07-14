import { extractVersion, type VersionedUrl } from "@blockprotocol/type-system";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { propertyObjectToPatches } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { PropertyObject } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  googleEntityTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { getRoots } from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/type-system-patch";
import { isEqual } from "lodash";

import type { ImpureGraphContext } from "../../../context-types";
import {
  getEntitySubgraph,
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
  authentication: { actorId: AccountId };
  context: ImpureGraphContext<false, true>;
  entityTypeBaseUrls: BaseUrl[];
  migrationState: MigrationState;
  migrateProperties?: Record<
    BaseUrl,
    (previousProperties: PropertyObject) => PropertyObject
  >;
  webOwnedById: OwnedById;
}) => {
  const webBotAccountId = await getWebMachineActorId(context, authentication, {
    ownedById: webOwnedById,
  });

  const webBotAuthentication = { actorId: webBotAccountId };

  const existingEntities = await getEntitySubgraph(
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
      graphResolveDepths: zeroedGraphResolveDepths,
      includeDrafts: true,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  ).then((subgraph) => getRoots(subgraph));

  for (const entity of existingEntities) {
    const baseUrl = extractBaseUrl(entity.metadata.entityTypeId);

    const currentVersion = extractVersion(entity.metadata.entityTypeId);

    const newVersion = migrationState.entityTypeVersions[baseUrl];

    if (typeof newVersion === "undefined") {
      throw new Error(
        `Could not find the version for base URL ${baseUrl} in the migration state`,
      );
    }

    if (currentVersion < newVersion) {
      const newEntityTypeId = versionedUrlFromComponents(baseUrl, newVersion);
      const currentEntityTypeId = entity.metadata.entityTypeId;

      const migratePropertiesFunction = migrateProperties?.[baseUrl];

      let updateAuthentication = webBotAuthentication;

      const temporaryEntityTypePermissionsGranted: VersionedUrl[] = [];

      if (
        baseUrl === systemEntityTypes.userSecret.entityTypeBaseUrl ||
        baseUrl ===
          systemLinkEntityTypes.usesUserSecret.linkEntityTypeBaseUrl ||
        baseUrl === googleEntityTypes.account.entityTypeBaseUrl
      ) {
        /**
         *These entities are only editable by the bot that created them
         */
        updateAuthentication = {
          actorId: entity.metadata.provenance.createdById,
        };
      }
      if (baseUrl === systemEntityTypes.machine.entityTypeBaseUrl) {
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

        for (const entityTypeId of [currentEntityTypeId, newEntityTypeId]) {
          /**
           * We may need to temporarily grant the machine account ID the ability
           * to instantiate entities of both the old and new entityTypeId,
           * because an actor cannot update or remove an entity type without being able to instantiate it.
           */
          const relationships = await context.graphApi
            .getEntityTypeAuthorizationRelationships(
              systemAccountId,
              entityTypeId,
            )
            .then(({ data }) => data);

          const relationAndSubject = {
            subject: {
              kind: "account",
              subjectId: entity.metadata.provenance.createdById,
            },
            relation: "instantiator",
          } as const;

          if (
            !relationships.find((relationship) =>
              isEqual(relationship, relationAndSubject),
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
            temporaryEntityTypePermissionsGranted.push(entityTypeId);
          }
        }
      }

      try {
        await updateEntity(context, updateAuthentication, {
          entity,
          entityTypeId: newEntityTypeId,
          propertyPatches: migratePropertiesFunction
            ? propertyObjectToPatches(
                migratePropertiesFunction(entity.properties),
              )
            : undefined,
        });
      } finally {
        for (const entityTypeId of temporaryEntityTypePermissionsGranted) {
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
                    subjectId: entity.metadata.provenance.createdById,
                  },
                  relation: "instantiator",
                },
              },
            ],
          );
        }
      }
    }
  }
};
