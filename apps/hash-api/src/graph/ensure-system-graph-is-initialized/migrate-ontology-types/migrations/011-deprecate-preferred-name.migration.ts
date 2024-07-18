import type { EntityType } from "@blockprotocol/type-system";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import type { MigrationFunction } from "../types";
import {
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeDependenciesInHashEntityType,
  upgradeEntitiesToNewTypeVersion,
} from "../util";
import { upgradeEntityTypeDependencies } from "../util/upgrade-entity-type-dependencies";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1. Update the `Actor` entity type to define the `displayName` property type
   */

  const currentActorEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "actor",
    migrationState,
  });

  const { schema: actorEntityTypeSchema } = await getEntityTypeById(
    context,
    authentication,
    {
      entityTypeId: currentActorEntityTypeId,
    },
  );

  const {
    propertyTypeId: displayNamePropertyTypeId,
    propertyTypeBaseUrl: displayNameBaseUrl,
  } = blockProtocolPropertyTypes.displayName;

  const newActorEntityTypeSchema: EntityType = {
    ...actorEntityTypeSchema,
    properties: {
      ...actorEntityTypeSchema.properties,
      [displayNameBaseUrl]: {
        $ref: displayNamePropertyTypeId,
      },
    },
  };

  const { updatedEntityTypeId: updatedActorEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentActorEntityTypeId,
      migrationState,
      newSchema: newActorEntityTypeSchema,
    });

  /**
   * Step 2. Update `Machine` to inherit from the latest version of `Actor`
   */

  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [updatedActorEntityTypeId],
    dependentEntityTypeKeys: ["machine"],
    migrationState,
  });

  /**
   * Step 3: as a drive-by update entity types that reference the
   * `Image` entity type
   */

  const latestImageEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "image",
    migrationState,
  });

  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [latestImageEntityTypeId],
    dependentEntityTypeKeys: ["organization"],
    migrationState,
  });

  const latestOrganizationEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "organization",
    migrationState,
  });

  /**
   * Step 4. Update `User` to inherit from the latest version of `Actor`,
   * removing the `preferredName` property type in the same update
   */

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
    ...upgradeEntityTypeDependencies({
      schema: userEntityTypeSchema,
      upgradedEntityTypeIds: [
        updatedActorEntityTypeId,
        /**
         * Drive by: upgrade references to the `Image` entity type
         * to the latest version of the type.
         */
        latestImageEntityTypeId,
        latestOrganizationEntityTypeId,
      ],
    }),
    properties: Object.entries(userEntityTypeSchema.properties).reduce(
      (prev, [propertyTypeBaseUrl, value]) => {
        if (
          propertyTypeBaseUrl ===
          systemPropertyTypes.preferredName.propertyTypeBaseUrl
        ) {
          return prev;
        } else {
          return {
            ...prev,
            [propertyTypeBaseUrl]: value,
          };
        }
      },
      {},
    ),
  };

  const { updatedEntityTypeId: updatedUserEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentUserEntityTypeId,
      migrationState,
      newSchema: newUserEntityTypeSchema,
    });

  /**
   * Step 5: Update entity types that reference the `User` entity type
   */

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

  /**
   * Step 6. Update entity types that reference the `Organization` entity type
   * (excluding the `User` entity type which was updated in step 4)
   */

  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [latestOrganizationEntityTypeId],
    dependentEntityTypeKeys: ["linearIntegration"],
    migrationState,
  });

  /**
   * Step 7: Assign entities of updated types to the latest version
   */
  const baseUrls = [
    systemEntityTypes.machine.entityTypeBaseUrl,
    systemEntityTypes.user.entityTypeBaseUrl,
    // Types that reference `User` which were updated
    systemEntityTypes.comment.entityTypeBaseUrl,
    systemEntityTypes.commentNotification.entityTypeBaseUrl,
    systemEntityTypes.linearIntegration.entityTypeBaseUrl,
    systemEntityTypes.mentionNotification.entityTypeBaseUrl,
    // Types that reference `Image` which were updated (excluding `User`)
    systemEntityTypes.organization.entityTypeBaseUrl,
    // Types that reference `Organization` which were updated (excluding `User`)
    systemEntityTypes.linearIntegration.entityTypeBaseUrl,
  ] as BaseUrl[];

  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: baseUrls,
    migrationState,
    migrateProperties: {
      [systemEntityTypes.user.entityTypeBaseUrl]: (previousUserProperties) => {
        const {
          [systemPropertyTypes.preferredName.propertyTypeBaseUrl]:
            previousPreferredName,
          ...remainingProperties
        } = previousUserProperties.value;

        return {
          value: {
            ...remainingProperties,
            [displayNameBaseUrl]: previousPreferredName,
          },
          metadata: previousUserProperties.metadata,
        };
      },
    },
  });

  return migrationState;
};

export default migrate;
