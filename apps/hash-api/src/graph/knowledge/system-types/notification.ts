import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { createNotificationEntityPermissions } from "@local/hash-backend-utils/notifications";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  notArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { CommentNotificationProperties } from "@local/hash-isomorphic-utils/system-types/commentnotification";
import { MentionNotificationProperties } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import { NotificationProperties } from "@local/hash-isomorphic-utils/system-types/notification";
import { Entity } from "@local/hash-subgraph";
import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";

import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
import {
  createEntity,
  CreateEntityParams,
  getEntities,
  updateEntityProperties,
} from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";
import { Block } from "./block";
import { Comment } from "./comment";
import { Page } from "./page";
import { Text } from "./text";
import { User } from "./user";

type Notification = {
  archived?: boolean;
  entity: Entity<NotificationProperties>;
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
          systemPropertyTypes.archived.propertyTypeId,
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
  systemEntityTypes.mentionNotification.entityTypeId;

export const getMentionNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  Notification
> = ({ entity }) => {
  if (!isEntityMentionNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.mentionNotification.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { archived } = simplifyProperties(entity.properties);

  return { entity, archived };
};

export const createMentionNotification: ImpureGraphFunction<
  Pick<CreateEntityParams, "ownedById"> & {
    triggeredByUser: User;
    occurredInEntity: Page;
    occurredInBlock: Block;
    occurredInComment?: Comment;
    occurredInText: Text;
  },
  Promise<MentionNotification>
> = async (context, userAuthentication, params) => {
  const {
    triggeredByUser,
    occurredInText,
    occurredInEntity,
    occurredInBlock,
    occurredInComment,
    ownedById,
  } = params;

  const webMachineActorId = await getWebMachineActorId(
    context,
    userAuthentication,
    { ownedById },
  );
  const authentication = { actorId: webMachineActorId };

  const { linkEntityRelationships, notificationEntityRelationships } =
    createNotificationEntityPermissions({
      machineActorId: webMachineActorId,
    });

  const entity = await createEntity(context, authentication, {
    ownedById,
    properties: {},
    entityTypeId: systemEntityTypes.mentionNotification.entityTypeId,
    relationships: notificationEntityRelationships,
  });

  await Promise.all(
    [
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
        relationships: linkEntityRelationships,
      }),
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
        relationships: linkEntityRelationships,
      }),
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
        relationships: linkEntityRelationships,
      }),
      occurredInComment
        ? createLinkEntity(context, authentication, {
            ownedById,
            leftEntityId: entity.metadata.recordId.entityId,
            rightEntityId: occurredInComment.entity.metadata.recordId.entityId,
            linkEntityTypeId:
              systemLinkEntityTypes.occurredInComment.linkEntityTypeId,
            relationships: linkEntityRelationships,
          })
        : [],
      createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: occurredInText.entity.metadata.recordId.entityId,
        linkEntityTypeId: systemLinkEntityTypes.occurredInText.linkEntityTypeId,
        relationships: linkEntityRelationships,
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
    includeDrafts?: boolean;
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
    includeDrafts = false,
  } = params;

  const entitiesSubgraph = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.mentionNotification.entityTypeId,
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
      includeDrafts,
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
        systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
    );

    const occurredInEntityLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
    );

    const occurredInBlockLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
    );

    const occurredInTextLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.occurredInText.linkEntityTypeId,
    );

    const occurredInCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.occurredInComment.linkEntityTypeId,
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
  systemEntityTypes.commentNotification.entityTypeId;

export const getCommentNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  Notification
> = ({ entity }) => {
  if (!isEntityCommentNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.commentNotification.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { archived } = simplifyProperties(entity.properties);

  return { entity, archived };
};

export const createCommentNotification: ImpureGraphFunction<
  Pick<CreateEntityParams, "ownedById"> & {
    triggeredByUser: User;
    triggeredByComment: Comment;
    occurredInEntity: Page;
    occurredInBlock: Block;
    repliedToComment?: Comment;
  },
  Promise<CommentNotification>
> = async (context, userAuthentication, params) => {
  const {
    triggeredByUser,
    triggeredByComment,
    occurredInEntity,
    occurredInBlock,
    repliedToComment,
    ownedById,
  } = params;

  const webMachineActorId = await getWebMachineActorId(
    context,
    userAuthentication,
    { ownedById },
  );
  const authentication = { actorId: webMachineActorId };

  const { linkEntityRelationships, notificationEntityRelationships } =
    createNotificationEntityPermissions({
      machineActorId: webMachineActorId,
    });

  const entity = await createEntity(context, authentication, {
    ownedById,
    properties: {},
    entityTypeId: systemEntityTypes.commentNotification.entityTypeId,
    outgoingLinks: [
      {
        ownedById,
        rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
        relationships: linkEntityRelationships,
      },
      {
        ownedById,
        rightEntityId: triggeredByComment.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemLinkEntityTypes.triggeredByComment.linkEntityTypeId,
        relationships: linkEntityRelationships,
      },
      {
        ownedById,
        rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
        relationships: linkEntityRelationships,
      },
      {
        ownedById,
        rightEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
        relationships: linkEntityRelationships,
      },
      repliedToComment
        ? {
            ownedById,
            rightEntityId: repliedToComment.entity.metadata.recordId.entityId,
            linkEntityTypeId:
              systemLinkEntityTypes.repliedToComment.linkEntityTypeId,
            relationships: linkEntityRelationships,
          }
        : [],
    ].flat(),
    relationships: notificationEntityRelationships,
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
    includeDrafts?: boolean;
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
    includeDrafts = false,
  } = params;

  const entitiesSubgraph = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.commentNotification.entityTypeId,
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
                        systemPropertyTypes.archived.propertyTypeId,
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
                        systemPropertyTypes.archived.propertyTypeId,
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
      includeDrafts,
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
        systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
    );

    const occurredInEntityLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
    );

    const occurredInBlockLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
    );

    const triggeredByCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.triggeredByComment.linkEntityTypeId,
    );

    const repliedToCommentLink = outgoingLinks.find(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.repliedToComment.linkEntityTypeId,
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
