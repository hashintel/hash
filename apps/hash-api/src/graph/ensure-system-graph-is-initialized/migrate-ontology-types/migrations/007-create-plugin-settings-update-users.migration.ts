import { EntityType } from "@blockprotocol/type-system";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { BaseUrl, linkEntityTypeUrl } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/type-system-patch";

import { getEntities, updateEntity } from "../../../knowledge/primitive/entity";
import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import { MigrationFunction } from "../types";
import {
  anyUserInstantiator,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeDependenciesInHashEntityType,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1. Create the Browser Plugin Settings entity type
   */
  const manualInferenceSettingsPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Manual Inference Settings",
        description: "Settings for a manual entity inference feature",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "hash",
      migrationState,
    });

  const automaticInferenceSettingsPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Automatic Inference Settings",
        description:
          "Settings for an automatic or passive entity inference feature",
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "hash",
      migrationState,
    });

  const browserPluginSettingsEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Browser Plugin Settings",
        description: "Settings for the HASH browser plugin",
        properties: [
          {
            propertyType: manualInferenceSettingsPropertyType,
          },
          {
            propertyType: automaticInferenceSettingsPropertyType,
          },
        ],
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    });

  /**
   * Step 2: Create the 'has' link
   */
  const hasLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [linkEntityTypeUrl],
        title: "Has",
        description: "Something that something has",
      },
      webShortname: "hash",
      migrationState,
      instantiator: anyUserInstantiator,
    },
  );

  /** Step 3: Update the User entity type to link to the Browser Plugin Settings entity type */

  const currentUserEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "user",
    migrationState,
  });

  const { schema: userEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentUserEntityTypeId,
    },
  );

  const newUserEntityTypeSchema: EntityType = {
    ...userEntityTypeSchema,
    links: {
      ...userEntityTypeSchema.links,
      [hasLinkEntityType.schema.$id]: {
        ordered: false,
        type: "array",
        items: {
          oneOf: [{ $ref: browserPluginSettingsEntityType.schema.$id }],
        },
      },
    },
  };

  const { updatedEntityTypeId: updatedUserEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentUserEntityTypeId,
      migrationState,
      newSchema: newUserEntityTypeSchema,
    });

  /** Step 4: Update the dependencies of entity types which we've updated above */
  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [updatedUserEntityTypeId],
    dependentEntityTypeKeys: [
      // These can all link to a User
      "comment",
      "commentNotification",
      "linearIntegration",
      "mentionNotification",
    ],
    migrationState,
  });

  /** Step 5: Assign entities of updated types to the latest version */
  const baseUrls = [
    systemEntityTypes.user.entityTypeBaseUrl,
    systemEntityTypes.comment.entityTypeBaseUrl,
    systemEntityTypes.commentNotification.entityTypeBaseUrl,
    systemEntityTypes.linearIntegration.entityTypeBaseUrl,
    systemEntityTypes.mentionNotification.entityTypeBaseUrl,
  ];

  const existingEntities = await getEntities(context, authentication, {
    query: {
      filter: {
        any: baseUrls.map((baseUrl) => ({
          equal: [{ path: ["type", "baseUrl"] }, { parameter: baseUrl }],
        })),
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      includeDrafts: true,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  }).then((subgraph) => getRoots(subgraph));

  for (const entity of existingEntities) {
    let newVersion: number;
    const baseUrl = extractBaseUrl(entity.metadata.entityTypeId);
    switch (baseUrl) {
      case systemEntityTypes.user.entityTypeBaseUrl:
        newVersion = migrationState.entityTypeVersions[baseUrl]!;
        break;
      case systemEntityTypes.comment.entityTypeBaseUrl:
        newVersion = migrationState.entityTypeVersions[baseUrl]!;
        break;
      case systemEntityTypes.commentNotification.entityTypeBaseUrl:
        newVersion =
          migrationState.entityTypeVersions[
            systemEntityTypes.commentNotification.entityTypeBaseUrl as BaseUrl
          ]!;
        break;
      case systemEntityTypes.linearIntegration.entityTypeBaseUrl:
        newVersion =
          migrationState.entityTypeVersions[
            systemEntityTypes.linearIntegration.entityTypeBaseUrl as BaseUrl
          ]!;
        break;
      case systemEntityTypes.mentionNotification.entityTypeBaseUrl:
        newVersion =
          migrationState.entityTypeVersions[
            systemEntityTypes.mentionNotification.entityTypeBaseUrl as BaseUrl
          ]!;
        break;
      default:
        throw new Error(`Unexpected entity type baseUrl: ${baseUrl}`);
    }
    const newEntityTypeId = versionedUrlFromComponents(baseUrl, newVersion);

    if (entity.metadata.entityTypeId !== newEntityTypeId) {
      await updateEntity(context, authentication, {
        entity,
        entityTypeId: newEntityTypeId,
        properties: entity.properties,
      });
    }
  }

  return migrationState;
};

export default migrate;
