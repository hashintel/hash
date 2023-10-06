import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import {
  AccountEntityId,
  Entity,
  EntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../..";
import { SYSTEM_TYPES } from "../../system-types";
import {
  createEntity,
  CreateEntityParams,
  getEntityIncomingLinks,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntityProperties,
  updateEntityProperty,
} from "../primitive/entity";
import {
  createLinkEntity,
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import { getUserFromEntity, User } from "./user";

export type Comment = {
  /**
   * @todo - these should probably be changed to encapsulate multi-axis versioning information, or should be explicitly
   *   documented as pertaining to either transaction or decision time
   *   - https://app.asana.com/0/1202805690238892/1203763454493756/f
   */
  resolvedAt?: string;
  deletedAt?: string;
  entity: Entity;
};

export const getCommentFromEntity: PureGraphFunction<
  { entity: Entity },
  Comment
> = ({ entity }) => {
  if (
    entity.metadata.entityTypeId !== SYSTEM_TYPES.entityType.comment.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.block.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const resolvedAt = entity.properties[
    SYSTEM_TYPES.propertyType.resolvedAt.metadata.recordId.baseUrl
  ] as string | undefined;

  const deletedAt = entity.properties[
    SYSTEM_TYPES.propertyType.deletedAt.metadata.recordId.baseUrl
  ] as string | undefined;

  return {
    resolvedAt,
    deletedAt,
    entity,
  };
};

/**
 * Get a system comment entity by its entity id.
 *
 * @param params.entityId - the entity id of the comment
 */
export const getCommentById: ImpureGraphFunction<
  { entityId: EntityId },
  Promise<Comment>
> = async (ctx, authentication, { entityId }) => {
  const entity = await getLatestEntityById(ctx, authentication, { entityId });

  return getCommentFromEntity({ entity });
};

/**
 * Get the text entity linked to the comment.
 *
 * @param params.comment - the comment
 */
export const getCommentText: ImpureGraphFunction<
  {
    commentEntityId: EntityId;
  },
  Promise<Entity>
> = async (ctx, authentication, { commentEntityId }) => {
  const hasTextLinks = await getEntityOutgoingLinks(ctx, authentication, {
    entityId: commentEntityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.hasText.schema.$id,
  });

  const [hasTextLink, ...unexpectedHasTextLinks] = hasTextLinks;

  if (unexpectedHasTextLinks.length > 0) {
    throw new Error(
      `Critical: Comment with entityId ${commentEntityId} has more than one linked text entities`,
    );
  }

  if (!hasTextLink) {
    throw new Error(
      `Critical: Comment with entityId ${commentEntityId} doesn't have any linked text entities`,
    );
  }

  return await getLinkEntityRightEntity(ctx, authentication, {
    linkEntity: hasTextLink,
  });
};

/**
 * Create a system comment entity.
 *
 * @param params.author - the user that created the comment
 * @param params.parent - the linked parent entity
 * @param params.tokens - the text tokens that describe the comment's text
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const createComment: ImpureGraphFunction<
  Omit<CreateEntityParams, "properties" | "entityTypeId"> & {
    author: User;
    parentEntityId: EntityId;
    tokens: TextToken[];
  },
  Promise<Comment>
> = async (ctx, authentication, params): Promise<Comment> => {
  const { ownedById, tokens, parentEntityId, author } = params;

  const [commentEntity, textEntity] = await Promise.all([
    createEntity(ctx, authentication, {
      ownedById,
      properties: {},
      entityTypeId: SYSTEM_TYPES.entityType.comment.schema.$id,
    }),
    createEntity(ctx, authentication, {
      ownedById,
      properties: {
        [SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl]: tokens,
      },
      entityTypeId: SYSTEM_TYPES.entityType.text.schema.$id,
    }),
  ]);

  await Promise.all([
    createLinkEntity(ctx, authentication, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.hasText,
      leftEntityId: commentEntity.metadata.recordId.entityId,
      rightEntityId: textEntity.metadata.recordId.entityId,
      ownedById,
    }),
    createLinkEntity(ctx, authentication, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
      leftEntityId: commentEntity.metadata.recordId.entityId,
      rightEntityId: parentEntityId,
      ownedById,
    }),
    createLinkEntity(ctx, authentication, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.author,
      leftEntityId: commentEntity.metadata.recordId.entityId,
      rightEntityId: author.entity.metadata.recordId.entityId,
      ownedById,
    }),
  ]);

  return getCommentFromEntity({ entity: commentEntity });
};

/**
 * Edit the text content of a comment.
 *
 * @param params.comment - the comment
 * @param params.actorId - id of the user that edited the comment
 * @param params.tokens - the new text tokens that describe the comment's text
 */
export const updateCommentText: ImpureGraphFunction<
  {
    commentEntityId: EntityId;
    tokens: TextToken[];
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const { commentEntityId, tokens } = params;

  if (
    authentication.actorId !== extractOwnedByIdFromEntityId(commentEntityId)
  ) {
    throw new Error(
      `Critical: account ${authentication.actorId} does not have permission to edit the comment with entityId ${commentEntityId}`,
    );
  }

  const textEntity = await getCommentText(ctx, authentication, {
    commentEntityId,
  });

  await updateEntityProperty(ctx, authentication, {
    entity: textEntity,
    propertyTypeBaseUrl:
      SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl,
    value: tokens,
  });
};

/**
 * Delete the comment.
 *
 * @param params.comment - the comment
 * @param params.actorId - id of the user that deleted the comment
 */
export const deleteComment: ImpureGraphFunction<
  {
    comment: Comment;
  },
  Promise<Comment>
> = async (ctx, authentication, params) => {
  const { comment } = params;

  // Throw error if the user trying to delete the comment is not the comment's author
  if (
    authentication.actorId !==
    extractOwnedByIdFromEntityId(
      comment.entity.metadata.recordId.entityId as AccountEntityId,
    )
  ) {
    throw new Error(
      `Critical: account ${authentication.actorId} does not have permission to delete the comment with entityId ${comment.entity.metadata.recordId}`,
    );
  }

  const updatedCommentEntity = await updateEntityProperties(
    ctx,
    authentication,
    {
      entity: comment.entity,
      updatedProperties: [
        {
          propertyTypeBaseUrl:
            SYSTEM_TYPES.propertyType.deletedAt.metadata.recordId.baseUrl,
          value: new Date().toISOString(),
        },
      ],
    },
  );

  return getCommentFromEntity({ entity: updatedCommentEntity });
};

/**
 * Get the parent entity linked to the comment (either a block or another comment).
 *
 * @param params.comment - the comment
 */
export const getCommentParent: ImpureGraphFunction<
  { commentEntityId: EntityId },
  Promise<Entity>
> = async (ctx, authentication, { commentEntityId }) => {
  const parentLinks = await getEntityOutgoingLinks(ctx, authentication, {
    entityId: commentEntityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.parent.schema.$id,
  });

  const [parentLink, ...unexpectedParentLinks] = parentLinks;

  if (!parentLink) {
    throw new Error(
      `Critical: comment with entityId ${commentEntityId} has no linked parent entity`,
    );
  }

  if (unexpectedParentLinks.length > 0) {
    throw new Error(
      `Critical: Comment with entityId ${commentEntityId} has more than one linked parent entity`,
    );
  }

  return await getLinkEntityRightEntity(ctx, authentication, {
    linkEntity: parentLink,
  });
};

/**
 * Get the user entity that created the comment.
 *
 * @param params.comment - the comment
 */
export const getCommentAuthor: ImpureGraphFunction<
  { commentEntityId: EntityId },
  Promise<User>
> = async (ctx, authentication, { commentEntityId }) => {
  const authorLinks = await getEntityOutgoingLinks(ctx, authentication, {
    entityId: commentEntityId,
    linkEntityTypeVersionedUrl: SYSTEM_TYPES.linkEntityType.author.schema.$id,
  });

  const [authorLink, ...unexpectedAuthorLinks] = authorLinks;

  if (!authorLink) {
    throw new Error(
      `Critical: comment with entityId ${commentEntityId} has no linked author entity`,
    );
  }

  if (unexpectedAuthorLinks.length > 0) {
    throw new Error(
      `Critical: Comment with entityId ${commentEntityId} has more than one linked author entity`,
    );
  }

  const entity = await getLinkEntityRightEntity(ctx, authentication, {
    linkEntity: authorLink,
  });

  return getUserFromEntity({ entity });
};

/**
 * Get the children comment entities of the comment.
 *
 * @param params.comment - the comment
 */
export const getCommentReplies: ImpureGraphFunction<
  { commentEntityId: EntityId },
  Promise<Comment[]>
> = async (ctx, authentication, { commentEntityId }) => {
  const replyLinks = await getEntityIncomingLinks(ctx, authentication, {
    entityId: commentEntityId,
    linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
  });

  return Promise.all(
    replyLinks.map((linkEntity) =>
      getLinkEntityLeftEntity(ctx, authentication, { linkEntity }),
    ),
  ).then((entities) =>
    entities.map((entity) => getCommentFromEntity({ entity })),
  );
};

/**
 * Resolve the comment.
 *
 * @param params.comment - the comment
 * @param params.actorId - id of the user that resolved the comment
 */
export const resolveComment: ImpureGraphFunction<
  {
    comment: Comment;
  },
  Promise<Comment>
> = async (ctx, authentication, params): Promise<Comment> => {
  const { comment } = params;

  const commentEntityId = comment.entity.metadata.recordId.entityId;

  const [parent, author] = await Promise.all([
    getCommentParent(ctx, authentication, { commentEntityId }),
    getCommentAuthor(ctx, authentication, { commentEntityId }),
  ]);

  // Throw error if the user trying to resolve the comment is not the comment's author
  // or the author of the block the comment is attached to
  if (
    authentication.actorId !== author.accountId &&
    parent.metadata.entityTypeId === SYSTEM_TYPES.entityType.block.schema.$id &&
    authentication.actorId !==
      extractOwnedByIdFromEntityId(parent.metadata.recordId.entityId)
  ) {
    throw new Error(
      `Critical: account ${authentication.actorId} does not have permission to resolve the comment with entityId ${commentEntityId}`,
    );
  }

  const updatedEntity = await updateEntityProperties(ctx, authentication, {
    entity: comment.entity,
    updatedProperties: [
      {
        propertyTypeBaseUrl:
          SYSTEM_TYPES.propertyType.resolvedAt.metadata.recordId.baseUrl,
        value: new Date().toISOString(),
      },
    ],
  });

  return getCommentFromEntity({ entity: updatedEntity });
};
