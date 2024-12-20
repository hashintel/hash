import type { EntityType } from "@blockprotocol/type-system";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
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
   * Step 1. Create the `applicationPreferences` property type
   */

  const applicationPreferencesPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Application Preferences",
        description:
          "A user or other entity's preferences for how an application should behave or appear",
        /**
         * Use an opaque object on the basis that the structure of application preferences will change frequently,
         * and its exact properties are not expected to be individually useful or queried as part of the ontology.
         * The TypeScript type will be maintained separately in the `hash-isomorphic-utils` package.
         */
        possibleValues: [{ primitiveDataType: "object" }],
      },
      webShortname: "hash",
      migrationState,
    });

  /**
   * Step 2: Add the `applicationPreferences` property type to the `User` entity type
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
      [extractBaseUrl(applicationPreferencesPropertyType.schema.$id)]: {
        $ref: applicationPreferencesPropertyType.schema.$id,
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
