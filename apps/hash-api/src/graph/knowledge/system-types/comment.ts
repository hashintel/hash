import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { CommentProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { TextToken } from "@local/hash-isomorphic-utils/types";
import {
  Entity,
  EntityId,
  EntityRelationAndSubject,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { EntityTypeMismatchError } from "../../../lib/error";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";
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
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import { Block, getBlockFromEntity } from "./block";
import { getTextFromEntity, Text } from "./text";
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
  if (entity.metadata.entityTypeId !== systemEntityTypes.comment.entityTypeId) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.comment.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { resolvedAt, deletedAt } = simplifyProperties(
    entity.properties as CommentProperties,
  );

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
  Promise<Text>
> = async (ctx, authentication, { commentEntityId }) => {
  const hasTextLinks = await getEntityOutgoingLinks(ctx, authentication, {
    entityId: commentEntityId,
    linkEntityTypeVersionedUrl: systemLinkEntityTypes.hasText.linkEntityTypeId,
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

  return getTextFromEntity({
    entity: await getLinkEntityRightEntity(ctx, authentication, {
      linkEntity: hasTextLink,
    }),
  });
};

/**
 * Create a system comment entity.
 *
 * @param params.author - the user that created the comment
 * @param params.parent - the linked parent entity
 * @param params.textualContent - the textual content that describe the comment's text
 *
 * @see {@link createEntity} for the documentation of the remaining parameters
 */
export const createComment: ImpureGraphFunction<
  Pick<CreateEntityParams, "ownedById"> & {
    author: User;
    parentEntityId: EntityId;
    textualContent: TextToken[];
  },
  Promise<Comment>
> = async (ctx, authentication, params): Promise<Comment> => {
  const { ownedById, textualContent, parentEntityId, author } = params;

  // the author has full access, regardless of which web the comment belongs to (ownedById)
  const relationships: EntityRelationAndSubject[] = [
    {
      relation: "administrator",
      subject: {
        kind: "account",
        subjectId: author.accountId,
      },
    },
    {
      relation: "setting",
      subject: {
        kind: "setting",
        subjectId: "administratorFromWeb",
      },
    },
    {
      relation: "setting",
      subject: {
        kind: "setting",
        subjectId: "viewFromWeb",
      },
    },
  ];

  const textEntity = await createEntity(ctx, authentication, {
    ownedById,
    properties: {
      [extractBaseUrl(
        blockProtocolPropertyTypes.textualContent.propertyTypeId,
      )]: textualContent,
    },
    entityTypeId: systemEntityTypes.text.entityTypeId,
    relationships,
  });

  const commentEntity = await createEntity(ctx, authentication, {
    ownedById,
    properties: {},
    entityTypeId: systemEntityTypes.comment.entityTypeId,
    outgoingLinks: [
      {
        linkEntityTypeId: systemLinkEntityTypes.hasParent.linkEntityTypeId,
        rightEntityId: parentEntityId,
        ownedById,
        owner: author.accountId,
        relationships,
      },
      {
        linkEntityTypeId: systemLinkEntityTypes.authoredBy.linkEntityTypeId,
        rightEntityId: author.entity.metadata.recordId.entityId,
        ownedById,
        owner: author.accountId,
        relationships,
      },
      /**
       * The creation of the `hasText` link entity has to occur last so
       * that the after create hook for the entity can access to the
       * `parent` nad `author` link entities.
       */
      {
        linkEntityTypeId: systemLinkEntityTypes.hasText.linkEntityTypeId,
        rightEntityId: textEntity.metadata.recordId.entityId,
        ownedById,
        owner: author.accountId,
        relationships,
      },
    ],
    relationships,
  });

  return getCommentFromEntity({ entity: commentEntity });
};

/**
 * Edit the text content of a comment.
 *
 * @param params.comment - the comment
 * @param params.actorId - id of the user that edited the comment
 * @param params.textualContent - the new textual content that describe the comment's text
 */
export const updateCommentText: ImpureGraphFunction<
  {
    commentEntityId: EntityId;
    textualContent: TextToken[];
  },
  Promise<void>
> = async (ctx, authentication, params) => {
  const { commentEntityId, textualContent } = params;

  const text = await getCommentText(ctx, authentication, {
    commentEntityId,
  });

  await updateEntityProperty(ctx, authentication, {
    entity: text.entity,
    propertyTypeBaseUrl: extractBaseUrl(
      blockProtocolPropertyTypes.textualContent.propertyTypeId,
    ),
    value: textualContent,
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

  const updatedCommentEntity = await updateEntityProperties(
    ctx,
    authentication,
    {
      entity: comment.entity,
      updatedProperties: [
        {
          propertyTypeBaseUrl: extractBaseUrl(
            systemPropertyTypes.deletedAt.propertyTypeId,
          ),
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
    linkEntityTypeVersionedUrl:
      systemLinkEntityTypes.hasParent.linkEntityTypeId,
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
    linkEntityTypeVersionedUrl:
      systemLinkEntityTypes.authoredBy.linkEntityTypeId,
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
    linkEntityTypeId: systemLinkEntityTypes.hasParent.linkEntityTypeId,
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

  const updatedEntity = await updateEntityProperties(ctx, authentication, {
    entity: comment.entity,
    updatedProperties: [
      {
        propertyTypeBaseUrl: extractBaseUrl(
          systemPropertyTypes.resolvedAt.propertyTypeId,
        ),
        value: new Date().toISOString(),
      },
    ],
  });

  return getCommentFromEntity({ entity: updatedEntity });
};

/**
 * Get the block ancestor of the comment.
 *
 * @param params.comment - the comment
 */
export const getCommentAncestorBlock: ImpureGraphFunction<
  { commentEntityId: EntityId },
  Promise<Block>
> = async (context, authentication, { commentEntityId }) => {
  const parentEntity = await getCommentParent(context, authentication, {
    commentEntityId,
  });

  if (
    parentEntity.metadata.entityTypeId === systemEntityTypes.block.entityTypeId
  ) {
    return getBlockFromEntity({ entity: parentEntity });
  } else {
    return getCommentAncestorBlock(context, authentication, {
      commentEntityId: parentEntity.metadata.recordId.entityId,
    });
  }
};
