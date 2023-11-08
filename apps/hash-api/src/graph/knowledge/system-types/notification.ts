import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  notArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { CommentNotificationProperties } from "@local/hash-isomorphic-utils/system-types/commentnotification";
import { MentionNotificationProperties } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import { NotificationProperties } from "@local/hash-isomorphic-utils/system-types/notification";
import { Entity, EntityId, EntityPropertiesObject } from "@local/hash-subgraph";
import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import {
  createEntity,
  CreateEntityParams,
  getEntities,
  getLatestEntityById,
  updateEntityProperties,
} from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";
import { Block } from "./block";
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
  systemTypes.entityType.notification.entityTypeId;

export const getNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  Notification
> = ({ entity }) => {
  if (!isEntityNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemTypes.entityType.notification.entityTypeId,
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
      ? {
          [extractBaseUrl(systemTypes.propertyType.title.propertyTypeId)]:
            title,
        }
      : {}),
  };

  const entity = await createEntity(ctx, authentication, {
    ownedById: params.ownedById,
    properties,
    entityTypeId: systemTypes.entityType.notification.entityTypeId,
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
        propertyTypeBaseUrl: extractBaseUrl(
          systemTypes.propertyType.archived.propertyTypeId,
        ),
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
  systemTypes.entityType.mentionNotification.entityTypeId;

export const getMentionNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  Notification
> = ({ entity }) => {
  if (!isEntityMentionNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemTypes.entityType.mentionNotification.entityTypeId,
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
    occurredInBlock: Block;
    occurredInComment?: Comment;
    occurredInText: Text;
  },
  Promise<MentionNotification>
> = async (context, authentication, params) => {
  const {
    triggeredByUser,
    occurredInText,
    occurredInEntity,
    occurredInBlock,
    occurredInComment,
    ownedById,
  } = params;

  const entity = await createEntity(context, authentication, {
    ownedById,
    properties: {},
    entityTypeId: systemTypes.entityType.mentionNotification.entityTypeId,
  });

  await Promise.all(
    [
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemTypes.linkEntityType.triggeredByUser.linkEntityTypeId,
      }),
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemTypes.linkEntityType.occurredInEntity.linkEntityTypeId,
      }),
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemTypes.linkEntityType.occurredInBlock.linkEntityTypeId,
      }),
      occurredInComment
        ? createLinkEntity(context, authentication, {
            ownedById,
            leftEntityId: entity.metadata.recordId.entityId,
            rightEntityId: occurredInComment.entity.metadata.recordId.entityId,
            linkEntityTypeId:
              systemTypes.linkEntityType.occurredInComment.linkEntityTypeId,
          })
        : [],
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: occurredInText.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemTypes.linkEntityType.occurredInText.linkEntityTypeId,
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
    occurredInBlock: Block;
    occurredInComment?: Comment;
    occurredInText: Text;
  },
  Promise<MentionNotification | null>
> = async (context, authentication, params) => {
  const {
    recipient,
    triggeredByUser,
    occurredInEntity,
    occurredInBlock,
    occurredInComment,
    occurredInText,
  } = params;

  const entitiesSubgraph = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemTypes.entityType.mentionNotification.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              { path: ["ownedById"] },
              { parameter: recipient.accountId },
            ],
          },
          notArchivedFilter,
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
        systemTypes.linkEntityType.triggeredByUser.linkEntityTypeId,
    );

    const occurredInEntityLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemTypes.linkEntityType.occurredInEntity.linkEntityTypeId,
    );

    const occurredInBlockLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemTypes.linkEntityType.occurredInBlock.linkEntityTypeId,
    );

    const occurredInTextLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemTypes.linkEntityType.occurredInText.linkEntityTypeId,
    );

    const occurredInCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemTypes.linkEntityType.occurredInComment.linkEntityTypeId,
    );

    return (
      triggeredByUserLink &&
      triggeredByUserLink.linkData.rightEntityId ===
        triggeredByUser.entity.metadata.recordId.entityId &&
      occurredInEntityLink &&
      occurredInEntityLink.linkData.rightEntityId ===
        occurredInEntity.entity.metadata.recordId.entityId &&
      occurredInBlockLink &&
      occurredInBlockLink.linkData.rightEntityId ===
        occurredInBlock.entity.metadata.recordId.entityId &&
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
  systemTypes.entityType.commentNotification.entityTypeId;

export const getCommentNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  Notification
> = ({ entity }) => {
  if (!isEntityCommentNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemTypes.entityType.commentNotification.entityTypeId,
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
    occurredInBlock: Block;
    repliedToComment?: Comment;
  },
  Promise<CommentNotification>
> = async (context, authentication, params) => {
  const {
    triggeredByUser,
    triggeredByComment,
    occurredInEntity,
    occurredInBlock,
    repliedToComment,
    ownedById,
  } = params;

  const entity = await createEntity(context, authentication, {
    ownedById,
    properties: {},
    entityTypeId: systemTypes.entityType.commentNotification.entityTypeId,
    outgoingLinks: [
      {
        ownedById,
        rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemTypes.linkEntityType.triggeredByUser.linkEntityTypeId,
      },
      {
        ownedById,
        rightEntityId: triggeredByComment.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemTypes.linkEntityType.triggeredByComment.linkEntityTypeId,
      },
      {
        ownedById,
        rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemTypes.linkEntityType.occurredInEntity.linkEntityTypeId,
      },
      {
        ownedById,
        rightEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemTypes.linkEntityType.occurredInBlock.linkEntityTypeId,
      },
      repliedToComment
        ? {
            ownedById,
            rightEntityId: repliedToComment.entity.metadata.recordId.entityId,
            linkEntityTypeId:
              systemTypes.linkEntityType.repliedToComment.linkEntityTypeId,
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
    occurredInBlock: Block;
    repliedToComment?: Comment;
  },
  Promise<CommentNotification | null>
> = async (context, authentication, params) => {
  const {
    recipient,
    triggeredByUser,
    triggeredByComment,
    occurredInEntity,
    occurredInBlock,
    repliedToComment,
  } = params;

  const entitiesSubgraph = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemTypes.entityType.commentNotification.entityTypeId,
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
                      extractBaseUrl(
                        systemTypes.propertyType.archived.propertyTypeId,
                      ),
                    ],
                  },
                  // @ts-expect-error -- We need to update the type definition of `EntityStructuralQuery` to allow for this
                  //   @see https://linear.app/hash/issue/H-1207
                  null,
                ],
              },
              {
                equal: [
                  {
                    path: [
                      "properties",
                      extractBaseUrl(
                        systemTypes.propertyType.archived.propertyTypeId,
                      ),
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
        systemTypes.linkEntityType.triggeredByUser.linkEntityTypeId,
    );

    const occurredInEntityLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemTypes.linkEntityType.occurredInEntity.linkEntityTypeId,
    );

    const occurredInBlockLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemTypes.linkEntityType.occurredInBlock.linkEntityTypeId,
    );

    const triggeredByCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemTypes.linkEntityType.triggeredByComment.linkEntityTypeId,
    );

    const repliedToCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemTypes.linkEntityType.repliedToComment.linkEntityTypeId,
    );

    return (
      triggeredByUserLink &&
      triggeredByUserLink.linkData.rightEntityId ===
        triggeredByUser.entity.metadata.recordId.entityId &&
      occurredInEntityLink &&
      occurredInEntityLink.linkData.rightEntityId ===
        occurredInEntity.entity.metadata.recordId.entityId &&
      occurredInBlockLink &&
      occurredInBlockLink.linkData.rightEntityId ===
        occurredInBlock.entity.metadata.recordId.entityId &&
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
