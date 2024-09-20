import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type {
  CreateEntityParameters,
  Entity,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  Comment as CommentEntity,
  CommentPropertiesWithMetadata,
  Text as TextEntity,
  TextPropertiesWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import type { EntityRelationAndSubject } from "@local/hash-subgraph";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";
import {
  createEntity,
  getEntityIncomingLinks,
  getEntityOutgoingLinks,
  getLatestEntityById,
  updateEntity,
} from "../primitive/entity";
import {
  getLinkEntityLeftEntity,
  getLinkEntityRightEntity,
} from "../primitive/link-entity";
import type { Block } from "./block";
import { getBlockFromEntity } from "./block";
import type { Text } from "./text";
import { getTextFromEntity } from "./text";
import type { User } from "./user";
import { getUserFromEntity } from "./user";

export type Comment = {
  /**
   * @todo - these should probably be changed to encapsulate multi-axis versioning information, or should be explicitly
   *   documented as pertaining to either transaction or decision time
   *   - https://linear.app/hash/issue/H-2991
   */
  resolvedAt?: string;
  deletedAt?: string;
  entity: Entity<CommentEntity>;
};

function assertCommentEntity(
  entity: Entity,
): asserts entity is Entity<CommentEntity> {
  if (
    !entity.metadata.entityTypeIds.includes(
      systemEntityTypes.comment.entityTypeId,
    )
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.comment.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }
}

export const getCommentFromEntity: PureGraphFunction<
  { entity: Entity },
  Comment
> = ({ entity }) => {
  assertCommentEntity(entity);

  return {
    resolvedAt:
      entity.properties[
        "https://hash.ai/@hash/types/property-type/resolved-at/"
      ],
    deletedAt:
      entity.properties[
        "https://hash.ai/@hash/types/property-type/deleted-at/"
      ],
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
  Pick<CreateEntityParameters, "ownedById"> & {
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

  const textEntity = await createEntity<TextEntity>(ctx, authentication, {
    ownedById,
    properties: {
      value: {
        "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
          {
            value: textualContent.map((text) => ({
              value: text,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
              },
            })),
          },
      },
    },
    entityTypeIds: [systemEntityTypes.text.entityTypeId],
    relationships,
  });

  const commentEntity = await createEntity<CommentEntity>(ctx, authentication, {
    ownedById,
    properties: { value: {} },
    entityTypeIds: [systemEntityTypes.comment.entityTypeId],
    outgoingLinks: [
      {
        ownedById,
        properties: { value: {} },
        linkData: {
          rightEntityId: parentEntityId,
        },
        entityTypeIds: [systemLinkEntityTypes.hasParent.linkEntityTypeId],
        relationships,
      },
      {
        ownedById,
        properties: { value: {} },
        linkData: {
          rightEntityId: author.entity.metadata.recordId.entityId,
        },
        entityTypeIds: [systemLinkEntityTypes.authoredBy.linkEntityTypeId],
        relationships,
      },
      /**
       * The creation of the `hasText` link entity has to occur last so
       * that the after create hook for the entity can access to the
       * `parent` nad `author` link entities.
       */
      {
        ownedById,
        properties: { value: {} },
        linkData: {
          rightEntityId: textEntity.metadata.recordId.entityId,
        },
        entityTypeIds: [systemLinkEntityTypes.hasText.linkEntityTypeId],
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
  Promise<void>,
  false,
  true
> = async (ctx, authentication, params) => {
  const { commentEntityId, textualContent } = params;

  const text = await getCommentText(ctx, authentication, {
    commentEntityId,
  });

  await updateEntity<TextEntity>(ctx, authentication, {
    entity: text.entity,
    propertyPatches: [
      {
        op: "replace",
        path: [blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl],
        property: {
          value: textualContent.map((textToken) => ({
            value: textToken,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          })),
        } satisfies TextPropertiesWithMetadata["value"]["https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"],
      },
    ],
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
  Promise<Comment>,
  false,
  true
> = async (ctx, authentication, params) => {
  const { comment } = params;

  const updatedCommentEntity = await updateEntity(ctx, authentication, {
    entity: comment.entity,
    propertyPatches: [
      {
        op: "add",
        path: [systemPropertyTypes.deletedAt.propertyTypeBaseUrl],
        property: {
          value: new Date().toISOString(),
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        } satisfies CommentPropertiesWithMetadata["value"]["https://hash.ai/@hash/types/property-type/deleted-at/"],
      },
    ],
  });

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
  Promise<Comment[]>,
  false,
  true
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
  Promise<Comment>,
  false,
  true
> = async (ctx, authentication, params): Promise<Comment> => {
  const { comment } = params;

  const updatedEntity = await updateEntity<CommentEntity>(ctx, authentication, {
    entity: comment.entity,
    propertyPatches: [
      {
        op: "add",
        path: [systemPropertyTypes.resolvedAt.propertyTypeBaseUrl],
        property: {
          value: new Date().toISOString(),
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        } satisfies CommentPropertiesWithMetadata["value"]["https://hash.ai/@hash/types/property-type/resolved-at/"],
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
    parentEntity.metadata.entityTypeIds.includes(
      systemEntityTypes.block.entityTypeId,
    )
  ) {
    // @todo - make sure the entity is really a block
    return getBlockFromEntity({ entity: parentEntity as Block["entity"] });
  } else {
    return getCommentAncestorBlock(context, authentication, {
      commentEntityId: parentEntity.metadata.recordId.entityId,
    });
  }
};
