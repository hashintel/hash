import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import {
  AccountEntityId,
  AccountId,
  Entity,
  EntityId,
  extractAccountId,
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
    SYSTEM_TYPES.propertyType.resolvedAt.metadata.recordId.baseUri
  ] as string | undefined;

  const deletedAt = entity.properties[
    SYSTEM_TYPES.propertyType.deletedAt.metadata.recordId.baseUri
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
> = async (ctx, { entityId }) => {
  const entity = await getLatestEntityById(ctx, { entityId });

  return getCommentFromEntity({ entity });
};

/**
 * Get the text entity linked to the comment.
 *
 * @param params.comment - the comment
 */
export const getCommentText: ImpureGraphFunction<
  {
    comment: Comment;
  },
  Promise<Entity>
> = async (ctx, { comment }) => {
  const hasTextLinks = await getEntityOutgoingLinks(ctx, {
    entity: comment.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.hasText,
  });

  const [hasTextLink, ...unexpectedHasTextLinks] = hasTextLinks;

  if (unexpectedHasTextLinks.length > 0) {
    throw new Error(
      `Critical: Comment with entityId ${comment.entity.metadata.recordId.entityId} has more than one linked text entities`,
    );
  }

  if (!hasTextLink) {
    throw new Error(
      `Critical: Comment with entityId ${comment.entity.metadata.recordId.entityId} doesn't have any linked text entities`,
    );
  }

  return await getLinkEntityRightEntity(ctx, { linkEntity: hasTextLink });
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
    parent: Entity;
    tokens: TextToken[];
  },
  Promise<Comment>
> = async (ctx, params): Promise<Comment> => {
  const { ownedById, actorId, tokens, parent, author } = params;

  const entity = await createEntity(ctx, {
    ownedById,
    properties: {},
    entityTypeId: SYSTEM_TYPES.entityType.comment.schema.$id,
    actorId,
  });

  const textEntity = await createEntity(ctx, {
    ownedById,
    properties: {
      [SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUri]: tokens,
    },
    entityTypeId: SYSTEM_TYPES.entityType.text.schema.$id,
    actorId,
  });

  await createLinkEntity(ctx, {
    linkEntityType: SYSTEM_TYPES.linkEntityType.hasText,
    leftEntityId: entity.metadata.recordId.entityId,
    rightEntityId: textEntity.metadata.recordId.entityId,
    ownedById,
    actorId,
  });

  await createLinkEntity(ctx, {
    linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
    leftEntityId: entity.metadata.recordId.entityId,
    rightEntityId: parent.metadata.recordId.entityId,
    ownedById,
    actorId,
  });

  await createLinkEntity(ctx, {
    linkEntityType: SYSTEM_TYPES.linkEntityType.author,
    leftEntityId: entity.metadata.recordId.entityId,
    rightEntityId: author.entity.metadata.recordId.entityId,
    ownedById,
    actorId,
  });

  return getCommentFromEntity({ entity });
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
    comment: Comment;
    actorId: AccountId;
    tokens: TextToken[];
  },
  Promise<void>
> = async (ctx, params) => {
  const { comment, actorId, tokens } = params;

  if (
    actorId !==
    extractAccountId(
      comment.entity.metadata.recordId.entityId as AccountEntityId,
    )
  ) {
    throw new Error(
      `Critical: account ${actorId} does not have permission to edit the comment with entityId ${comment.entity.metadata.recordId.entityId}`,
    );
  }

  const textEntity = await getCommentText(ctx, { comment });

  await updateEntityProperty(ctx, {
    entity: textEntity,
    propertyTypeBaseUri:
      SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUri,
    value: tokens,
    actorId,
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
    actorId: AccountId;
  },
  Promise<Comment>
> = async (ctx, params) => {
  const { comment, actorId } = params;

  // Throw error if the user trying to delete the comment is not the comment's author
  if (
    actorId !==
    extractAccountId(
      comment.entity.metadata.recordId.entityId as AccountEntityId,
    )
  ) {
    throw new Error(
      `Critical: account ${actorId} does not have permission to delete the comment with entityId ${comment.entity.metadata.recordId}`,
    );
  }

  const updatedCommentEntity = await updateEntityProperties(ctx, {
    entity: comment.entity,
    updatedProperties: [
      {
        propertyTypeBaseUri:
          SYSTEM_TYPES.propertyType.deletedAt.metadata.recordId.baseUri,
        value: new Date().toISOString(),
      },
    ],
    actorId,
  });

  return getCommentFromEntity({ entity: updatedCommentEntity });
};

/**
 * Get the parent entity linked to the comment (either a block or another comment).
 *
 * @param params.comment - the comment
 */
export const getCommentParent: ImpureGraphFunction<
  { comment: Comment },
  Promise<Entity>
> = async (ctx, { comment }) => {
  const parentLinks = await getEntityOutgoingLinks(ctx, {
    entity: comment.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
  });

  const [parentLink, ...unexpectedParentLinks] = parentLinks;

  if (!parentLink) {
    throw new Error(
      `Critical: comment with entityId ${comment.entity.metadata.recordId.entityId} has no linked parent entity`,
    );
  }

  if (unexpectedParentLinks.length > 0) {
    throw new Error(
      `Critical: Comment with entityId ${comment.entity.metadata.recordId.entityId} has more than one linked parent entity`,
    );
  }

  return await getLinkEntityRightEntity(ctx, { linkEntity: parentLink });
};

/**
 * Get the user entity that created the comment.
 *
 * @param params.comment - the comment
 */
export const getCommentAuthor: ImpureGraphFunction<
  { comment: Comment },
  Promise<User>
> = async (ctx, { comment }) => {
  const authorLinks = await getEntityOutgoingLinks(ctx, {
    entity: comment.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.author,
  });

  const [authorLink, ...unexpectedAuthorLinks] = authorLinks;

  if (!authorLink) {
    throw new Error(
      `Critical: comment with entityId ${comment.entity.metadata.recordId.entityId} has no linked author entity`,
    );
  }

  if (unexpectedAuthorLinks.length > 0) {
    throw new Error(
      `Critical: Comment with entityId ${comment.entity.metadata.recordId.entityId} has more than one linked author entity`,
    );
  }

  const entity = await getLinkEntityRightEntity(ctx, {
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
  { comment: Comment },
  Promise<Comment[]>
> = async (ctx, { comment }) => {
  const replyLinks = await getEntityIncomingLinks(ctx, {
    entity: comment.entity,
    linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
  });

  return Promise.all(
    replyLinks.map((linkEntity) =>
      getLinkEntityLeftEntity(ctx, { linkEntity }),
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
    actorId: AccountId;
  },
  Promise<Comment>
> = async (ctx, params): Promise<Comment> => {
  const { comment, actorId } = params;

  const parent = await getCommentParent(ctx, { comment });
  const author = await getCommentAuthor(ctx, { comment });

  // Throw error if the user trying to resolve the comment is not the comment's author
  // or the author of the block the comment is attached to
  if (
    actorId !==
      extractAccountId(
        author.entity.metadata.recordId.entityId as AccountEntityId,
      ) &&
    parent.metadata.entityTypeId === SYSTEM_TYPES.entityType.block.schema.$id &&
    actorId !== extractOwnedByIdFromEntityId(parent.metadata.recordId.entityId)
  ) {
    throw new Error(
      `Critical: account ${actorId} does not have permission to resolve the comment with entityId ${comment.entity.metadata.recordId.entityId}`,
    );
  }

  const updatedEntity = await updateEntityProperties(ctx, {
    entity: comment.entity,
    updatedProperties: [
      {
        propertyTypeBaseUri:
          SYSTEM_TYPES.propertyType.resolvedAt.metadata.recordId.baseUri,
        value: new Date().toISOString(),
      },
    ],
    actorId,
  });

  return getCommentFromEntity({ entity: updatedEntity });
};
