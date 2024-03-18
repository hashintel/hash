import type { EntityType } from "@blockprotocol/type-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { BaseUrl } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import type { MigrationFunction } from "../types";
import {
  createSystemPropertyTypeIfNotExists,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeDependenciesInHashEntityType,
  upgradeEntitiesToNewTypeVersion,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1. Create the `enabledFeatureFlags` property type
   */

  const enabledFeatureFlagsPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Enabled Feature Flags",
        description:
          "A list of identifiers for a feature flags that are enabled.",
        possibleValues: [{ primitiveDataType: "text", array: true }],
      },
      webShortname: "hash",
      migrationState,
    });

  /**
   * Step 2: Add the `enabledFeatureFlags` property type to the `User` entity type
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
    ...userEntityTypeSchema,
    properties: {
      ...userEntityTypeSchema.properties,
      [extractBaseUrl(enabledFeatureFlagsPropertyType.schema.$id)]: {
        $ref: enabledFeatureFlagsPropertyType.schema.$id,
      },
    },
  };

  const { updatedEntityTypeId: updatedUserEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentUserEntityTypeId,
      migrationState,
      newSchema: newUserEntityTypeSchema,
    });

  /**
   * Step 4: Update the dependencies of the `User` entity type
   * */
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
   * Step 5: Assign entities of updated types to the latest version
   */
  const baseUrls = [
    systemEntityTypes.user.entityTypeBaseUrl,
    // Types that reference `User` which were updated
    systemEntityTypes.comment.entityTypeBaseUrl,
    systemEntityTypes.commentNotification.entityTypeBaseUrl,
    systemEntityTypes.linearIntegration.entityTypeBaseUrl,
    systemEntityTypes.mentionNotification.entityTypeBaseUrl,
  ] as BaseUrl[];

  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: baseUrls,
    migrationState,
  });

  return migrationState;
};

export default migrate;
