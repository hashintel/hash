import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
/** @todo: figure out why this isn't in `@local/hash-isomorphic-utils/system-types/shared` */
import { CommentNotificationProperties } from "@local/hash-isomorphic-utils/system-types/commentnotification";
/** @todo: figure out why this isn't in `@local/hash-isomorphic-utils/system-types/shared` */
import { MentionNotificationProperties } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
/** @todo: figure out why this isn't in `@local/hash-isomorphic-utils/system-types/shared` */
import { NotificationProperties } from "@local/hash-isomorphic-utils/system-types/notification";
import { Entity, EntityId, EntityPropertiesObject } from "@local/hash-subgraph";
import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import {
  createEntity,
  CreateEntityParams,
  getEntities,
  getLatestEntityById,
  updateEntityProperties,
} from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";
import { Comment } from "./comment";
import { Page } from "./page";
import { Text } from "./text";
import { User } from "./user";

export type Notification = {
  archived?: boolean;
  entity: Entity<NotificationProperties>;
};

export const isEntityNotificationEntity = (
  entity: Entity,
): entity is Entity<NotificationProperties> =>
  entity.metadata.entityTypeId ===
  SYSTEM_TYPES.entityType.notification.schema.$id;

export const getNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  Notification
> = ({ entity }) => {
  if (!isEntityNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.notification.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const { archived } = simplifyProperties(entity.properties);

  return { entity, archived };
};

/**
 * Create a system notification entity.
 *
 * @param params.title - the title of the notification
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const createNotification: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    title?: string;
  },
  Promise<Notification>
> = async (ctx, authentication, params) => {
  const { title } = params;

  const properties: EntityPropertiesObject = {
    ...(title
      ? { [SYSTEM_TYPES.propertyType.title.metadata.recordId.baseUrl]: title }
      : {}),
  };

  const entity = await createEntity(ctx, authentication, {
    ownedById: params.ownedById,
    properties,
    entityTypeId: SYSTEM_TYPES.entityType.notification.schema.$id,
  });

  return getNotificationFromEntity({ entity });
};

/**
 * Get a system notification entity by its entity id.
 *
 * @param params.entityId - the entity id of the notification
 */
export const getNotificationById: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<Notification>
> = async (ctx, authentication, { entityId }) => {
  const entity = await getLatestEntityById(ctx, authentication, {
    entityId,
  });

  return getNotificationFromEntity({ entity });
};

export const archiveNotification: ImpureGraphFunction<
  { notification: Notification },
  Promise<void>
> = async (context, authentication, params) => {
  await updateEntityProperties(context, authentication, {
    entity: params.notification.entity,
    updatedProperties: [
      {
        propertyTypeBaseUrl:
          SYSTEM_TYPES.propertyType.archived.metadata.recordId.baseUrl,
        value: true,
      },
    ],
  });
};

export type MentionNotification = {
  entity: Entity<MentionNotificationProperties>;
} & Notification;

export const isEntityMentionNotificationEntity = (
  entity: Entity,
): entity is Entity<MentionNotificationProperties> =>
  entity.metadata.entityTypeId ===
  SYSTEM_TYPES.entityType.mentionNotification.schema.$id;

export const getMentionNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  Notification
> = ({ entity }) => {
  if (!isEntityMentionNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.mentionNotification.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const { archived } = simplifyProperties(entity.properties);

  return { entity, archived };
};

export const createMentionNotification: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    triggeredByUser: User;
    occurredInEntity: Page;
    occurredInComment?: Comment;
    occurredInText: Text;
  },
  Promise<MentionNotification>
> = async (context, authentication, params) => {
  const {
    triggeredByUser,
    occurredInText,
    occurredInEntity,
    occurredInComment,
    ownedById,
  } = params;

  const entity = await createEntity(context, authentication, {
    ownedById,
    properties: {},
    entityTypeId: SYSTEM_TYPES.entityType.mentionNotification.schema.$id,
  });

  await Promise.all(
    [
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
        linkEntityType: SYSTEM_TYPES.linkEntityType.triggeredByUser,
      }),
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        linkEntityType: SYSTEM_TYPES.linkEntityType.occurredInEntity,
      }),
      occurredInComment
        ? createLinkEntity(context, authentication, {
            ownedById,
            leftEntityId: entity.metadata.recordId.entityId,
            rightEntityId: occurredInComment.entity.metadata.recordId.entityId,
            linkEntityType: SYSTEM_TYPES.linkEntityType.occurredInComment,
          })
        : [],
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: occurredInText.entity.metadata.recordId.entityId,
        linkEntityType: SYSTEM_TYPES.linkEntityType.occurredInText,
      }),
    ].flat(),
  );

  return getMentionNotificationFromEntity({ entity });
};

export const getMentionNotification: ImpureGraphFunction<
  {
    recipient: User;
    triggeredByUser: User;
    occurredInEntity: Page;
    occurredInComment?: Comment;
    occurredInText: Text;
  },
  Promise<MentionNotification | null>
> = async (context, authentication, params) => {
  const {
    recipient,
    triggeredByUser,
    occurredInEntity,
    occurredInComment,
    occurredInText,
  } = params;

  const entitiesSubgraph = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.mentionNotification.schema.$id,
            { ignoreParents: true },
          ),
          {
            equal: [
              { path: ["ownedById"] },
              { parameter: recipient.accountId },
            ],
          },
          {
            any: [
              {
                equal: [
                  {
                    path: [
                      "properties",
                      SYSTEM_TYPES.propertyType.archived.metadata.recordId
                        .baseUrl,
                    ],
                  },
                  // @ts-expect-error -- We need to update the type definition of `EntityStructuralQuery` to allow for this
                  null,
                ],
              },
              {
                equal: [
                  {
                    path: [
                      "properties",
                      SYSTEM_TYPES.propertyType.archived.metadata.recordId
                        .baseUrl,
                    ],
                  },
                  { parameter: false },
                ],
              },
            ],
          },
        ],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        // Get the outgoing links of the entities
        hasLeftEntity: { outgoing: 0, incoming: 1 },
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  });

  /**
   * @todo: move these filters into the query when it is possible to filter
   * on more than one outgoing entity
   *
   * @see https://linear.app/hash/issue/H-1169/explore-and-allow-specifying-multiple-structural-query-filters
   */
  const matchingEntities = getRoots(entitiesSubgraph).filter((entity) => {
    const outgoingLinks = getOutgoingLinksForEntity(
      entitiesSubgraph,
      entity.metadata.recordId.entityId,
    ) as LinkEntity[];

    const triggeredByUserLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        SYSTEM_TYPES.linkEntityType.triggeredByUser.schema.$id,
    );

    const occurredInEntityLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        SYSTEM_TYPES.linkEntityType.occurredInEntity.schema.$id,
    );

    const occurredInTextLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        SYSTEM_TYPES.linkEntityType.occurredInText.schema.$id,
    );

    const occurredInCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        SYSTEM_TYPES.linkEntityType.occurredInComment.schema.$id,
    );

    return (
      triggeredByUserLink &&
      triggeredByUserLink.linkData.rightEntityId ===
        triggeredByUser.entity.metadata.recordId.entityId &&
      occurredInEntityLink &&
      occurredInEntityLink.linkData.rightEntityId ===
        occurredInEntity.entity.metadata.recordId.entityId &&
      occurredInTextLink &&
      occurredInTextLink.linkData.rightEntityId ===
        occurredInText.entity.metadata.recordId.entityId &&
      (occurredInComment
        ? occurredInCommentLink &&
          occurredInCommentLink.linkData.rightEntityId ===
            occurredInComment.entity.metadata.recordId.entityId
        : true)
    );
  });

  if (matchingEntities.length > 1) {
    throw new Error(
      "More than one page mention notification found for a given recipient, trigger user, page, and text.",
    );
  }

  const [mentionNotificationEntity] = matchingEntities;

  return mentionNotificationEntity
    ? getMentionNotificationFromEntity({
        entity: mentionNotificationEntity,
      })
    : null;
};

export type CommentNotification = {
  entity: Entity<MentionNotificationProperties>;
} & Notification;

export const isEntityCommentNotificationEntity = (
  entity: Entity,
): entity is Entity<CommentNotificationProperties> =>
  entity.metadata.entityTypeId ===
  SYSTEM_TYPES.entityType.commentNotification.schema.$id;

export const getCommentNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  Notification
> = ({ entity }) => {
  if (!isEntityCommentNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.commentNotification.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const { archived } = simplifyProperties(entity.properties);

  return { entity, archived };
};

export const createCommentNotification: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    triggeredByUser: User;
    triggeredByComment: Comment;
    occurredInEntity: Page;
    repliedToComment?: Comment;
  },
  Promise<CommentNotification>
> = async (context, authentication, params) => {
  const {
    triggeredByUser,
    triggeredByComment,
    occurredInEntity,
    repliedToComment,
    ownedById,
  } = params;

  const entity = await createEntity(context, authentication, {
    ownedById,
    properties: {},
    entityTypeId: SYSTEM_TYPES.entityType.commentNotification.schema.$id,
    outgoingLinks: [
      {
        ownedById,
        rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
        linkEntityType: SYSTEM_TYPES.linkEntityType.triggeredByUser,
      },
      {
        ownedById,
        rightEntityId: triggeredByComment.entity.metadata.recordId.entityId,
        linkEntityType: SYSTEM_TYPES.linkEntityType.triggeredByComment,
      },
      {
        ownedById,
        rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        linkEntityType: SYSTEM_TYPES.linkEntityType.occurredInEntity,
      },
      repliedToComment
        ? {
            ownedById,
            rightEntityId: repliedToComment.entity.metadata.recordId.entityId,
            linkEntityType: SYSTEM_TYPES.linkEntityType.repliedToComment,
          }
        : [],
    ].flat(),
  });

  return getCommentNotificationFromEntity({ entity });
};

export const getCommentNotification: ImpureGraphFunction<
  {
    recipient: User;
    triggeredByUser: User;
    triggeredByComment: Comment;
    occurredInEntity: Page;
    repliedToComment?: Comment;
  },
  Promise<CommentNotification | null>
> = async (context, authentication, params) => {
  const {
    recipient,
    triggeredByUser,
    triggeredByComment,
    occurredInEntity,
    repliedToComment,
  } = params;

  const entitiesSubgraph = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.commentNotification.schema.$id,
            { ignoreParents: true },
          ),
          {
            equal: [
              { path: ["ownedById"] },
              { parameter: recipient.accountId },
            ],
          },
          /** @todo: enforce the type of these links somehow */
          {
            any: [
              {
                equal: [
                  {
                    path: [
                      "properties",
                      SYSTEM_TYPES.propertyType.archived.metadata.recordId
                        .baseUrl,
                    ],
                  },
                  // @ts-expect-error -- We need to update the type definition of `EntityStructuralQuery` to allow for this
                  null,
                ],
              },
              {
                equal: [
                  {
                    path: [
                      "properties",
                      SYSTEM_TYPES.propertyType.archived.metadata.recordId
                        .baseUrl,
                    ],
                  },
                  { parameter: false },
                ],
              },
            ],
          },
        ],
      },
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        // Get the outgoing links of the entities
        hasLeftEntity: { outgoing: 0, incoming: 1 },
      },
      temporalAxes: currentTimeInstantTemporalAxes,
    },
  });

  /**
   * @todo: move these filters into the query when it is possible to filter
   * on more than one outgoing entity
   *
   * @see https://linear.app/hash/issue/H-1169/explore-and-allow-specifying-multiple-structural-query-filters
   */
  const matchingEntities = getRoots(entitiesSubgraph).filter((entity) => {
    const outgoingLinks = getOutgoingLinksForEntity(
      entitiesSubgraph,
      entity.metadata.recordId.entityId,
    ) as LinkEntity[];

    const triggeredByUserLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        SYSTEM_TYPES.linkEntityType.triggeredByUser.schema.$id,
    );

    const occurredInEntityLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        SYSTEM_TYPES.linkEntityType.occurredInEntity.schema.$id,
    );

    const triggeredByCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        SYSTEM_TYPES.linkEntityType.triggeredByComment.schema.$id,
    );

    const repliedToCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        SYSTEM_TYPES.linkEntityType.repliedToComment.schema.$id,
    );

    return (
      triggeredByUserLink &&
      triggeredByUserLink.linkData.rightEntityId ===
        triggeredByUser.entity.metadata.recordId.entityId &&
      occurredInEntityLink &&
      occurredInEntityLink.linkData.rightEntityId ===
        occurredInEntity.entity.metadata.recordId.entityId &&
      triggeredByCommentLink &&
      triggeredByCommentLink.linkData.rightEntityId ===
        triggeredByComment.entity.metadata.recordId.entityId &&
      (repliedToComment
        ? repliedToCommentLink &&
          repliedToCommentLink.linkData.rightEntityId ===
            repliedToComment.entity.metadata.recordId.entityId
        : true)
    );
  });

  if (matchingEntities.length > 1) {
    throw new Error(
      "More than one comment notification found for a given recipient, trigger user, page, comment and replied to comment.",
    );
  }

  const [commentNotificationEntity] = matchingEntities;

  return commentNotificationEntity
    ? getCommentNotificationFromEntity({
        entity: commentNotificationEntity,
      })
    : null;
};
