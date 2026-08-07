import { NotFoundError } from "@local/hash-backend-utils/error";
import { getEntityTypeById } from "@local/hash-graph-sdk/entity-type";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  getCurrentHashLinkEntityTypeId,
  getCurrentHashSystemEntityTypeId,
  updateSystemEntityType,
  upgradeEntitiesToNewTypeVersion,
} from "../util";

import type { MigrationFunction } from "../types";
import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";

const getEntityType = async (
  context: Parameters<MigrationFunction>[0]["context"],
  authentication: Parameters<MigrationFunction>[0]["authentication"],
  entityTypeId: VersionedUrl,
) => {
  const entityType = await getEntityTypeById(context.graphApi, authentication, {
    entityTypeId,
    temporalAxes: currentTimeInstantTemporalAxes,
  });

  if (!entityType) {
    throw new NotFoundError(`Could not find entity type ${entityTypeId}`);
  }

  return entityType;
};

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const currentOpportunityStatusUpdateEntityTypeId =
    getCurrentHashSystemEntityTypeId({
      entityTypeKey: "opportunityStatusUpdate",
      migrationState,
    });
  const opportunityStatusUpdateEntityType = await getEntityType(
    context,
    authentication,
    currentOpportunityStatusUpdateEntityTypeId,
  );

  await updateSystemEntityType(context, authentication, {
    currentEntityTypeId: currentOpportunityStatusUpdateEntityTypeId,
    migrationState,
    newSchema: {
      ...opportunityStatusUpdateEntityType.schema,
      properties: {
        ...opportunityStatusUpdateEntityType.schema.properties,
        [systemPropertyTypes.title.propertyTypeBaseUrl]: {
          $ref: systemPropertyTypes.title.propertyTypeId,
        },
        [blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl]: {
          $ref: blockProtocolPropertyTypes.textualContent.propertyTypeId,
        },
      },
    },
  });

  const currentMentionNotificationEntityTypeId =
    getCurrentHashSystemEntityTypeId({
      entityTypeKey: "mentionNotification",
      migrationState,
    });

  const mentionNotificationEntityType = await getEntityType(
    context,
    authentication,
    currentMentionNotificationEntityTypeId,
  );

  const occurredInEntityLinkEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "occurredInEntity",
    migrationState,
  });
  const occurredInBlockLinkEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "occurredInBlock",
    migrationState,
  });
  const occurredInCommentLinkEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "occurredInComment",
    migrationState,
  });
  const occurredInTextLinkEntityTypeId = getCurrentHashLinkEntityTypeId({
    linkEntityTypeKey: "occurredInText",
    migrationState,
  });

  const legacyContextLinkTypeIds = [
    occurredInBlockLinkEntityTypeId,
    occurredInCommentLinkEntityTypeId,
    occurredInTextLinkEntityTypeId,
  ];

  const links: NonNullable<EntityType["links"]> = {
    ...mentionNotificationEntityType.schema.links,
    [occurredInEntityLinkEntityTypeId]: {
      type: "array",
      items: {},
      minItems: 1,
      maxItems: 1,
    },
  };

  for (const legacyContextLinkTypeId of legacyContextLinkTypeIds) {
    const existingLinkConstraint =
      mentionNotificationEntityType.schema.links?.[legacyContextLinkTypeId];

    if (existingLinkConstraint) {
      links[legacyContextLinkTypeId] = {
        ...existingLinkConstraint,
        minItems: 0,
        maxItems: 1,
      };
    }
  }

  await updateSystemEntityType(context, authentication, {
    currentEntityTypeId: currentMentionNotificationEntityTypeId,
    migrationState,
    newSchema: {
      ...mentionNotificationEntityType.schema,
      description: "A notification that a user was mentioned in an entity.",
      links,
    },
  });

  /** Move existing status updates and notifications onto the latest versions. */
  await upgradeEntitiesToNewTypeVersion(context, authentication, {
    entityTypeBaseUrls: [
      systemEntityTypes.opportunityStatusUpdate.entityTypeBaseUrl,
      systemEntityTypes.mentionNotification.entityTypeBaseUrl,
    ],
    migrationState,
  });

  return migrationState;
};

export default migrate;
