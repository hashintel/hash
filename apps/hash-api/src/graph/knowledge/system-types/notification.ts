import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import {
  extractBaseUrl,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import { getWebMachineId } from "@local/hash-backend-utils/machine-actors";
import {
  HashLinkEntity,
  queryEntitySubgraph,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  pageOrNotificationNotArchivedFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { createEntity, updateEntity } from "../primitive/entity";
import { createLinkEntity } from "../primitive/link-entity";

import type {
  ImpureGraphContext,
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import type { Block } from "./block";
import type { Comment } from "./comment";
import type { Page } from "./page";
import type { Text } from "./text";
import type { User } from "./user";
import type {
  EntityId,
  PropertyPatchOperation,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  CreateEntityParameters,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import type {
  ArchivedPropertyValueWithMetadata,
  CommentNotification as CommentNotificationEntity,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
import type { MentionNotification as MentionNotificationEntity } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import type {
  Notification as NotificationEntity,
  ReadAtPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/notification";

export type Notification = {
  archived?: boolean;
  readAt?: string;
  entity: HashEntity<NotificationEntity>;
};

const notificationEntityTypeBaseUrls = new Set([
  systemEntityTypes.notification.entityTypeBaseUrl,
  systemEntityTypes.commentNotification.entityTypeBaseUrl,
  systemEntityTypes.graphChangeNotification.entityTypeBaseUrl,
  systemEntityTypes.mentionNotification.entityTypeBaseUrl,
]);

export const isEntityNotificationEntity = (entity: HashEntity): boolean =>
  entity.metadata.entityTypeIds.some((entityTypeId) =>
    notificationEntityTypeBaseUrls.has(extractBaseUrl(entityTypeId)),
  );

export const getNotificationFromEntity: PureGraphFunction<
  { entity: HashEntity },
  Notification
> = ({ entity }) => {
  if (!isEntityNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.notification.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }

  const { archived, readAt } = simplifyProperties(
    entity.properties as NotificationEntity["properties"],
  );

  return {
    entity: entity as HashEntity<NotificationEntity>,
    archived,
    readAt,
  };
};

type AnyNotification = Notification | MentionNotification | CommentNotification;

const updateNotificationAsWebMachine: ImpureGraphFunction<
  {
    notification: AnyNotification;
    propertyPatches: PropertyPatchOperation[];
  },
  Promise<void>,
  false,
  true
> = async (context, authentication, { notification, propertyPatches }) => {
  const webId = extractWebIdFromEntityId(
    notification.entity.metadata.recordId.entityId,
  );
  if (webId !== authentication.actorId) {
    throw new Error(
      "Notification updates must be requested by the user who owns the notification web.",
    );
  }

  const webMachineActorId = await getWebMachineId(context, authentication, {
    webId,
  }).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new Error(`Failed to get web machine for web ID: ${webId}`);
    }
    return maybeMachineId;
  });

  await updateEntity<
    MentionNotificationEntity | CommentNotificationEntity | NotificationEntity
  >(
    context,
    { actorId: webMachineActorId },
    {
      entity: notification.entity,
      propertyPatches,
    },
  );
};

export const archiveNotification: ImpureGraphFunction<
  { notification: AnyNotification },
  Promise<void>,
  false,
  true
> = async (context, authentication, params) => {
  await updateNotificationAsWebMachine(context, authentication, {
    notification: params.notification,
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

export const markNotificationAsRead: ImpureGraphFunction<
  { notification: AnyNotification; readAt: string },
  Promise<void>,
  false,
  true
> = async (context, authentication, { notification, readAt }) => {
  if (notification.readAt) {
    return;
  }

  await updateNotificationAsWebMachine(context, authentication, {
    notification,
    propertyPatches: [
      {
        op: "add",
        path: [systemPropertyTypes.readAt.propertyTypeBaseUrl],
        property: {
          value: readAt,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
          },
        } satisfies ReadAtPropertyValueWithMetadata,
      },
    ],
  });
};

export type MentionNotification = {
  entity: HashEntity<MentionNotificationEntity>;
} & Omit<Notification, "entity">;

export const isEntityMentionNotificationEntity = (
  entity: HashEntity,
): entity is HashEntity<MentionNotificationEntity> =>
  entity.metadata.entityTypeIds.some(
    (entityTypeId) =>
      extractBaseUrl(entityTypeId) ===
      systemEntityTypes.mentionNotification.entityTypeBaseUrl,
  );

export const getMentionNotificationFromEntity: PureGraphFunction<
  { entity: HashEntity },
  MentionNotification
> = ({ entity }) => {
  if (!isEntityMentionNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.mentionNotification.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }

  const { archived, readAt } = simplifyProperties(entity.properties);

  return { entity, archived, readAt };
};

export const createMentionNotification: ImpureGraphFunction<
  Pick<CreateEntityParameters, "webId"> & {
    triggeredByUser: User;
    occurredInEntity: { entity: HashEntity };
    occurredInBlock?: Block;
    occurredInComment?: Comment;
    occurredInText?: Text;
  },
  Promise<MentionNotification>
> = async (context, userAuthentication, params) => {
  const {
    triggeredByUser,
    occurredInText,
    occurredInEntity,
    occurredInBlock,
    occurredInComment,
    webId,
  } = params;

  const webMachineActorId = await getWebMachineId(context, userAuthentication, {
    webId,
  }).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new Error(
        `Failed to get web machine for user account ID: ${userAuthentication.actorId}`,
      );
    }
    return maybeMachineId;
  });

  const botAuthentication = { actorId: webMachineActorId };

  const entity = await createEntity<MentionNotificationEntity>(
    context,
    botAuthentication,
    {
      webId,
      properties: { value: {} },
      entityTypeIds: [systemEntityTypes.mentionNotification.entityTypeId],
    },
  );

  const linksToCreate: {
    rightEntityId: EntityId;
    linkEntityTypeId: VersionedUrl;
  }[] = [
    {
      rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
      linkEntityTypeId: systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
    },
    {
      rightEntityId: occurredInEntity.entity.metadata.recordId.entityId,
      linkEntityTypeId: systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
    },
  ];

  if (occurredInBlock) {
    linksToCreate.push({
      rightEntityId: occurredInBlock.entity.metadata.recordId.entityId,
      linkEntityTypeId: systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
    });
  }

  if (occurredInComment) {
    linksToCreate.push({
      rightEntityId: occurredInComment.entity.metadata.recordId.entityId,
      linkEntityTypeId:
        systemLinkEntityTypes.occurredInComment.linkEntityTypeId,
    });
  }

  if (occurredInText) {
    linksToCreate.push({
      rightEntityId: occurredInText.entity.metadata.recordId.entityId,
      linkEntityTypeId: systemLinkEntityTypes.occurredInText.linkEntityTypeId,
    });
  }

  try {
    await Promise.all(
      linksToCreate.map(({ rightEntityId, linkEntityTypeId }) =>
        /**
         * We do this separately with the user's authority because we need to use the user's authority to create the links
         * We cannot use a bot scoped to the user's web, because the thing that we are linking to (comments, pages)
         * might be in different webs, e.g. if the page is in an organization's web, which the bot can't read.
         *
         * Ideally we would have a global bot with restricted permissions across all webs to do this – H-1605
         */
        createLinkEntity(context, userAuthentication, {
          webId,
          properties: { value: {} },
          linkData: {
            leftEntityId: entity.metadata.recordId.entityId,
            rightEntityId,
          },
          entityTypeIds: [linkEntityTypeId],
        }),
      ),
    );
  } catch (error) {
    try {
      await updateEntity<MentionNotificationEntity>(
        context as ImpureGraphContext<false, true>,
        botAuthentication,
        {
          entity,
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
        },
      );
    } catch (cleanupError) {
      context.logger?.error(
        "Failed to archive a partially-created mention notification",
        {
          cleanupError,
          notificationEntityId: entity.metadata.recordId.entityId,
        },
      );
    }
    throw error;
  }

  return getMentionNotificationFromEntity({ entity });
};

export const getMentionNotification: ImpureGraphFunction<
  {
    recipient: User;
    triggeredByUser: User;
    occurredInEntity: { entity: HashEntity };
    occurredInBlock?: Block;
    occurredInComment?: Comment;
    occurredInText?: Text;
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

  const { subgraph: entitiesSubgraph } = await queryEntitySubgraph(
    context,
    authentication,
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              {
                parameter:
                  systemEntityTypes.mentionNotification.entityTypeBaseUrl,
              },
            ],
          },
          {
            equal: [{ path: ["webId"] }, { parameter: recipient.accountId }],
          },
          pageOrNotificationNotArchivedFilter,
        ],
      },
      traversalPaths: [
        {
          edges: [
            {
              kind: "has-left-entity",
              direction: "incoming",
            },
          ],
        },
      ],
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
      includePermissions: false,
    },
  );

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
    ).map((linkEntity) => new HashLinkEntity(linkEntity));

    const triggeredByUserLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
      ),
    );

    const occurredInEntityLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
      ),
    );

    const occurredInBlockLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
      ),
    );

    const occurredInTextLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.occurredInText.linkEntityTypeId,
      ),
    );

    const occurredInCommentLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.occurredInComment.linkEntityTypeId,
      ),
    );

    return (
      triggeredByUserLink &&
      triggeredByUserLink.linkData.rightEntityId ===
        triggeredByUser.entity.metadata.recordId.entityId &&
      occurredInEntityLink &&
      occurredInEntityLink.linkData.rightEntityId ===
        occurredInEntity.entity.metadata.recordId.entityId &&
      (occurredInBlock
        ? occurredInBlockLink &&
          occurredInBlockLink.linkData.rightEntityId ===
            occurredInBlock.entity.metadata.recordId.entityId
        : true) &&
      (occurredInText
        ? occurredInTextLink &&
          occurredInTextLink.linkData.rightEntityId ===
            occurredInText.entity.metadata.recordId.entityId
        : true) &&
      (occurredInComment
        ? occurredInCommentLink &&
          occurredInCommentLink.linkData.rightEntityId ===
            occurredInComment.entity.metadata.recordId.entityId
        : true)
    );
  });

  if (matchingEntities.length > 1) {
    throw new Error(
      "More than one mention notification found for the given recipient, triggering user, target entity, and optional context.",
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
  entity: HashEntity<CommentNotificationEntity>;
} & Omit<Notification, "entity">;

export const isEntityCommentNotificationEntity = (
  entity: HashEntity,
): entity is HashEntity<CommentNotificationEntity> =>
  entity.metadata.entityTypeIds.includes(
    systemEntityTypes.commentNotification.entityTypeId,
  );

export const getCommentNotificationFromEntity: PureGraphFunction<
  { entity: HashEntity },
  CommentNotification
> = ({ entity }) => {
  if (!isEntityCommentNotificationEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.commentNotification.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }

  const { archived, readAt } = simplifyProperties(entity.properties);

  return { entity, archived, readAt };
};

export const createCommentNotification: ImpureGraphFunction<
  Pick<CreateEntityParameters, "webId"> & {
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
    webId,
  } = params;

  const webMachineActorId = await getWebMachineId(context, userAuthentication, {
    webId,
  }).then((maybeMachineId) => {
    if (!maybeMachineId) {
      throw new Error(
        `Failed to get web machine for user account ID: ${userAuthentication.actorId}`,
      );
    }
    return maybeMachineId;
  });
  const authentication = { actorId: webMachineActorId };

  const notificationEntity = await createEntity<CommentNotificationEntity>(
    context,
    authentication,
    {
      webId,
      properties: { value: {} },
      entityTypeIds: [systemEntityTypes.commentNotification.entityTypeId],
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
        webId,
        properties: { value: {} },
        linkData: {
          leftEntityId,
          rightEntityId,
        },
        entityTypeIds: [entityTypeId],
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

  const { subgraph: entitiesSubgraph } = await queryEntitySubgraph(
    context,
    authentication,
    {
      filter: {
        all: [
          {
            equal: [
              { path: ["type", "baseUrl"] },
              {
                parameter:
                  systemEntityTypes.commentNotification.entityTypeBaseUrl,
              },
            ],
          },
          {
            equal: [{ path: ["webId"] }, { parameter: recipient.accountId }],
          },
        ],
      },
      traversalPaths: [
        {
          // Get the outgoing links of the entities
          edges: [
            {
              kind: "has-left-entity",
              direction: "incoming",
            },
          ],
        },
      ],
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
      includePermissions: false,
    },
  );

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
    ).map((linkEntity) => new HashLinkEntity(linkEntity));

    const triggeredByUserLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
      ),
    );

    const occurredInEntityLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
      ),
    );

    const occurredInBlockLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
      ),
    );

    const triggeredByCommentLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.triggeredByComment.linkEntityTypeId,
      ),
    );

    const repliedToCommentLink = outgoingLinks.find(({ metadata }) =>
      metadata.entityTypeIds.includes(
        systemLinkEntityTypes.repliedToComment.linkEntityTypeId,
      ),
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
