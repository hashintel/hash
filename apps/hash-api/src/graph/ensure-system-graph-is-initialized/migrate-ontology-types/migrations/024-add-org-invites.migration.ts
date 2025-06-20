import { type BaseUrl, type EntityType } from "@blockprotocol/type-system";
import {
  blockProtocolEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getEntityTypeById } from "../../../ontology/primitive/entity-type";
import type { MigrationFunction } from "../types";
import {
  createSystemEntityTypeIfNotExists,
  getCurrentHashPropertyTypeId,
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
   * Step 1: Create the 'Is Invited To' link type
   */
  const expiredAtPropertyTypeId = getCurrentHashPropertyTypeId({
    migrationState,
    propertyTypeKey: "expiredAt",
  });

  const organizationEntityTypeId = getCurrentHashSystemEntityTypeId({
    migrationState,
    entityTypeKey: "organization",
  });

  const isInvitedToEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Is Invited To",
        description: "Something that something is invited to.",
        properties: [
          {
            propertyType: expiredAtPropertyTypeId,
            required: true,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const emailPropertyTypeId = getCurrentHashPropertyTypeId({
    migrationState,
    propertyTypeKey: "email",
  });

  /**
   * Step 2: Create an 'Invited User' entity type as a placeholder for users who are not signed up yet
   */
  const _invitedUserEntityTypeId = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Invited User",
        description:
          "A potential user who has been invited to the application.",
        properties: [
          {
            propertyType: emailPropertyTypeId,
            required: true,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: isInvitedToEntityType.schema.$id,
            destinationEntityTypes: [organizationEntityTypeId],
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  /**
   * Step 3: Add the `Is Invited To` link type to the `User` entity type
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
    links: {
      ...userEntityTypeSchema.links,
      [isInvitedToEntityType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: organizationEntityTypeId,
            },
          ],
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
