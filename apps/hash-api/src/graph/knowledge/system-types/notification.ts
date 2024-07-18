import type { VersionedUrl } from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { createNotificationEntityPermissions } from "@local/hash-backend-utils/notifications";
import type {
  CreateEntityParameters,
  Entity,
} from "@local/hash-graph-sdk/entity";
import { LinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  pageOrNotificationNotArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  ArchivedPropertyValueWithMetadata,
  CommentNotification as CommentNotificationEntity,
  OccurredInBlock,
  OccurredInEntity,
  TriggeredByUser,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
import type {
  MentionNotification as MentionNotificationEntity,
  OccurredInComment,
  OccurredInText,
} from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import type { Notification as NotificationEntity } from "@local/hash-isomorphic-utils/system-types/notification";
import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import {
  createEntity,
  getEntitySubgraph,
  updateEntity,
} from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";
import type { Block } from "./block";
import type { Comment } from "./comment";
import type { Page } from "./page";
import type { Text } from "./text";
import type { User } from "./user";

type Notification = {
  archived?: boolean;
  entity: Entity<NotificationEntity>;
};

export const archiveNotification: ImpureGraphFunction<
  { notification: Notification | MentionNotification | CommentNotification },
  Promise<void>,
  false,
  true
> = async (context, authentication, params) => {
  await updateEntity<
    MentionNotificationEntity | CommentNotificationEntity | NotificationEntity
  >(context, authentication, {
    entity: params.notification.entity,
    propertyPatches: [
      {
        op: "add",
        path: [systemPropertyTypes.archived.propertyTypeBaseUrl],
        property: {
          value: true,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
          },
        } satisfies ArchivedPropertyValueWithMetadata,
      },
    ],
  });
};

export type MentionNotification = {
  entity: Entity<MentionNotificationEntity>;
} & Omit<Notification, "entity">;

export const isEntityMentionNotificationEntity = (
  entity: Entity,
): entity is Entity<MentionNotificationEntity> =>
  entity.metadata.entityTypeId ===
  systemEntityTypes.mentionNotification.entityTypeId;

export const getMentionNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  MentionNotification
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
  Pick<CreateEntityParameters, "ownedById"> & {
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
  const botAuthentication = { actorId: webMachineActorId };

  const { linkEntityRelationships, notificationEntityRelationships } =
    createNotificationEntityPermissions({
      machineActorId: webMachineActorId,
    });

  const entity = await createEntity<MentionNotificationEntity>(
    context,
    botAuthentication,
    {
      ownedById,
      properties: { value: {} },
      entityTypeId: systemEntityTypes.mentionNotification.entityTypeId,
      relationships: notificationEntityRelationships,
    },
  );

  await Promise.all(
    [
      /**
       * We do this separately with the user's authority because we need to use the user's authority to create the links
       * We cannot use a bot scoped to the user's web, because the thing that we are linking to (comments, pages)
       * might be in different webs, e.g. if the page is in an organization's web, which the bot can't read.
       *
       * Ideally we would have a global bot with restricted permissions across all webs to do this – H-1605
       */
      createLinkEntity<TriggeredByUser>(context, userAuthentication, {
        ownedById,
        properties: { value: {} },
        linkData: {
          leftEntityId: entity.metadata.recordId.entityId,
          rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
        },
        entityTypeId: systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
        relationships: linkEntityRelationships,
      }),
      createLinkEntity<OccurredInEntity>(context, userAuthentication, {
        ownedById,
        properties: { value: {} },
        linkData: {
          leftEntityId: entity.metadata.recordId.entityId,
          rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        },
        entityTypeId: systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
        relationships: linkEntityRelationships,
      }),
      createLinkEntity<OccurredInBlock>(context, userAuthentication, {
        ownedById,
        properties: { value: {} },
        linkData: {
          leftEntityId: entity.metadata.recordId.entityId,
          rightEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        },
        entityTypeId: systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
        relationships: linkEntityRelationships,
      }),
      occurredInComment
        ? createLinkEntity<OccurredInComment>(context, userAuthentication, {
            ownedById,
            properties: { value: {} },
            linkData: {
              leftEntityId: entity.metadata.recordId.entityId,
              rightEntityId:
                occurredInComment.entity.metadata.recordId.entityId,
            },
            entityTypeId:
              systemLinkEntityTypes.occurredInComment.linkEntityTypeId,
            relationships: linkEntityRelationships,
          })
        : [],
      createLinkEntity<OccurredInText>(context, userAuthentication, {
        ownedById,
        properties: { value: {} },
        linkData: {
          leftEntityId: entity.metadata.recordId.entityId,
          rightEntityId: occurredInText.entity.metadata.recordId.entityId,
        },
        entityTypeId: systemLinkEntityTypes.occurredInText.linkEntityTypeId,
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

  const entitiesSubgraph = await getEntitySubgraph(context, authentication, {
    filter: {
      all: [
        generateVersionedUrlMatchingFilter(
          systemEntityTypes.mentionNotification.entityTypeId,
          { ignoreParents: true },
        ),
        {
          equal: [{ path: ["ownedById"] }, { parameter: recipient.accountId }],
        },
        pageOrNotificationNotArchivedFilter,
      ],
    },
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      // Get the outgoing links of the entities
      hasLeftEntity: { outgoing: 0, incoming: 1 },
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts,
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
    ).map((linkEntity) => new LinkEntity(linkEntity));

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
  entity: Entity<CommentNotificationEntity>;
} & Omit<Notification, "entity">;

export const isEntityCommentNotificationEntity = (
  entity: Entity,
): entity is Entity<CommentNotificationEntity> =>
  entity.metadata.entityTypeId ===
  systemEntityTypes.commentNotification.entityTypeId;

export const getCommentNotificationFromEntity: PureGraphFunction<
  { entity: Entity },
  CommentNotification
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
  Pick<CreateEntityParameters, "ownedById"> & {
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

  const notificationEntity = await createEntity<CommentNotificationEntity>(
    context,
    authentication,
    {
      ownedById,
      properties: { value: {} },
      entityTypeId: systemEntityTypes.commentNotification.entityTypeId,
      relationships: notificationEntityRelationships,
    },
  );

  const leftEntityId = notificationEntity.metadata.recordId.entityId;

  const linksToCreate: {
    rightEntityId: EntityId;
    linkEntityTypeId: VersionedUrl;
  }[] = [
    {
      rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
      linkEntityTypeId: systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
    },
    {
      rightEntityId: triggeredByComment.entity.metadata.recordId.entityId,
      linkEntityTypeId:
        systemLinkEntityTypes.triggeredByComment.linkEntityTypeId,
    },
    {
      rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
      linkEntityTypeId: systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
    },
    {
      rightEntityId: occurredInBlock.entity.metadata.recordId.entityId,
      linkEntityTypeId: systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
    },
  ];

  if (repliedToComment) {
    linksToCreate.push({
      rightEntityId: repliedToComment.entity.metadata.recordId.entityId,
      linkEntityTypeId: systemLinkEntityTypes.repliedToComment.linkEntityTypeId,
    });
  }

  await Promise.all(
    linksToCreate.map(({ rightEntityId, linkEntityTypeId: entityTypeId }) =>
      /**
       * We do this separately with the user's authority because we need to use the user's authority to create the links
       * We cannot use a bot scoped to the user's web, because the thing that we are linking to (comments, pages)
       * might be in different webs, e.g. if the page is in an organization's web, which the bot can't read.
       *
       * Ideally we would have a global bot with restricted permissions across all webs to do this – H-1605
       */
      createLinkEntity(context, userAuthentication, {
        ownedById,
        properties: { value: {} },
        linkData: {
          leftEntityId,
          rightEntityId,
        },
        entityTypeId,
        relationships: linkEntityRelationships,
      }),
    ),
  );

  return getCommentNotificationFromEntity({ entity: notificationEntity });
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
  Promise<CommentNotification | null>,
  false,
  true
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

  const entitiesSubgraph = await getEntitySubgraph(context, authentication, {
    filter: {
      all: [
        generateVersionedUrlMatchingFilter(
          systemEntityTypes.commentNotification.entityTypeId,
          { ignoreParents: true },
        ),
        {
          equal: [{ path: ["ownedById"] }, { parameter: recipient.accountId }],
        },
        /** @todo: enforce the type of these links somehow */
        {
          any: [
            {
              equal: [
                {
                  path: [
                    "properties",
                    systemPropertyTypes.archived.propertyTypeBaseUrl,
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
                    systemPropertyTypes.archived.propertyTypeBaseUrl,
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
    ).map((linkEntity) => new LinkEntity(linkEntity));

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
