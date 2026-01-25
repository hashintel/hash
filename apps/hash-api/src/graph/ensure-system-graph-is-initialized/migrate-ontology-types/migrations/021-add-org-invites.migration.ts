import type { BaseUrl, EntityType } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

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
   * Step 1: Create the 'Invitation Via Email' and 'Invitation Via Shortname' link types,
   * and the 'Has Issued Invitation' link type which will link these from an Organization
   */
  const expiredAtPropertyTypeId = getCurrentHashPropertyTypeId({
    migrationState,
    propertyTypeKey: "expiredAt",
  });

  const emailPropertyTypeId = getCurrentHashPropertyTypeId({
    migrationState,
    propertyTypeKey: "email",
  });

  const shortnamePropertyTypeId = getCurrentHashPropertyTypeId({
    migrationState,
    propertyTypeKey: "shortname",
  });

  const invitationEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Invitation",
        description: "A request or offer to join or attend something.",
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

  const invitationViaEmailEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Invitation Via Email",
        description: "An invitation issued to an email address.",
        allOf: [invitationEntityType.schema.$id],
        properties: [
          {
            propertyType: emailPropertyTypeId,
            required: true,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const invitationViaShortnameEntityType =
    await createSystemEntityTypeIfNotExists(context, authentication, {
      entityTypeDefinition: {
        title: "Invitation Via Shortname",
        description: "An invitation issued to a user via their shortname.",
        allOf: [invitationEntityType.schema.$id],
        properties: [
          {
            propertyType: shortnamePropertyTypeId,
            required: true,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    });

  const hasIssuedInvitationLinkType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Has Issued Invitation",
        description: "An invitation that something has issued.",
      },
      migrationState,
      webShortname: "h",
    },
  );

  /**
   * Step 2: Add the `Has Issued Invitation` link type to the `Organization` entity type
   */

  const currentOrganizationEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "organization",
    migrationState,
  });

  const organizationEntityType = await getEntityTypeById(
    context.graphApi,
    authentication,
    {
      entityTypeId: currentOrganizationEntityTypeId,
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  );

  if (!organizationEntityType) {
    throw new NotFoundError(
      `Could not find entity type with ID ${currentOrganizationEntityTypeId}`,
    );
  }

  const newOrganizationEntityTypeSchema: EntityType = {
    ...organizationEntityType.schema,
    links: {
      ...organizationEntityType.schema.links,
      [hasIssuedInvitationLinkType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: invitationViaEmailEntityType.schema.$id,
            },
            {
              $ref: invitationViaShortnameEntityType.schema.$id,
            },
          ],
        },
      },
    },
  };

  const { updatedEntityTypeId: updatedOrganizationEntityTypeId } =
    await updateSystemEntityType(context, authentication, {
      currentEntityTypeId: currentOrganizationEntityTypeId,
      migrationState,
      newSchema: newOrganizationEntityTypeSchema,
    });

  /**
   * Step 3: Update the dependencies of the `Organization` entity type
   * */
  await upgradeDependenciesInHashEntityType(context, authentication, {
    upgradedEntityTypeIds: [updatedOrganizationEntityTypeId],

    dependentEntityTypeKeys: [
      /**
       * The Linear Integration and User types can link to the `Organization` entity type
       */
      "user",
      "linearIntegration",
      /**
       * These can link to a User
       */
      "comment",
      "commentNotification",
      "mentionNotification",
    ],

    migrationState,
  });

  /**
   * Step 4: Assign entities of updated types to the latest version
   */
  const baseUrls = [
    systemEntityTypes.organization.entityTypeBaseUrl,
    systemEntityTypes.linearIntegration.entityTypeBaseUrl,
    systemEntityTypes.user.entityTypeBaseUrl,
    systemEntityTypes.comment.entityTypeBaseUrl,
    systemEntityTypes.commentNotification.entityTypeBaseUrl,
    systemEntityTypes.mentionNotification.entityTypeBaseUrl,
  ] as BaseUrl[];

  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: baseUrls,
    migrationState,
  });

  return migrationState;
};

export default migrate;
