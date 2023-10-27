import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { OwnedById } from "@local/hash-subgraph/.";

import {
  getBlockCollectionByBlock,
  getBlockFromEntity,
} from "../../system-types/block";
import {
  getCommentAncestorBlock,
  getCommentAuthor,
  getCommentFromEntity,
  getCommentParent,
} from "../../system-types/comment";
import { createCommentNotification } from "../../system-types/notification";
import { getPageCreator, getPageFromEntity } from "../../system-types/page";
import {
  CreateEntityHook,
  CreateEntityHookCallback,
} from "./create-entity-hooks";

const commentCreateHookCallback: CreateEntityHookCallback = async ({
  entity,
  authentication,
  context,
}) => {
  const comment = getCommentFromEntity({ entity });

  const commentParent = await getCommentParent(context, authentication, {
    commentEntityId: entity.metadata.recordId.entityId,
  });

  // If the parent of the comment is a block, check if we need to create a comment notification
  if (
    commentParent.metadata.entityTypeId === types.entityType.block.entityTypeId
  ) {
    const parentBlock = getBlockFromEntity({ entity: commentParent });
    const blockCollectionEntity = await getBlockCollectionByBlock(
      context,
      authentication,
      { block: parentBlock },
    );

    if (
      blockCollectionEntity &&
      blockCollectionEntity.metadata.entityTypeId ===
        types.entityType.page.entityTypeId
    ) {
      const occurredInPage = getPageFromEntity({
        entity: blockCollectionEntity,
      });

      const recipientUser = await getPageCreator(context, authentication, {
        pageEntityId: occurredInPage.entity.metadata.recordId.entityId,
      });

      const commentAuthor = await getCommentAuthor(context, authentication, {
        commentEntityId: comment.entity.metadata.recordId.entityId,
      });

      // If the comment author is not the recipient, then create a page comment notification
      if (commentAuthor.accountId !== recipientUser.accountId) {
        await createCommentNotification(
          context,
          { actorId: recipientUser.accountId },
          {
            ownedById: recipientUser.accountId as OwnedById,
            triggeredByUser: commentAuthor,
            triggeredByComment: comment,
            occurredInEntity: occurredInPage,
          },
        );
      }
    }
    // If the parent is another comment check if we need to create a comment reply notification
  } else if (
    commentParent.metadata.entityTypeId ===
    types.entityType.comment.entityTypeId
  ) {
    const parentComment = getCommentFromEntity({ entity: commentParent });

    const ancestorBlock = await getCommentAncestorBlock(
      context,
      authentication,
      { commentEntityId: parentComment.entity.metadata.recordId.entityId },
    );

    const blockCollectionEntity = await getBlockCollectionByBlock(
      context,
      authentication,
      { block: ancestorBlock },
    );

    if (
      blockCollectionEntity &&
      blockCollectionEntity.metadata.entityTypeId ===
        types.entityType.page.entityTypeId
    ) {
      const occurredInPage = getPageFromEntity({
        entity: blockCollectionEntity,
      });

      const [commentAuthor, recipientUser] = await Promise.all([
        getCommentAuthor(context, authentication, {
          commentEntityId: comment.entity.metadata.recordId.entityId,
        }),
        getCommentAuthor(context, authentication, {
          commentEntityId: parentComment.entity.metadata.recordId.entityId,
        }),
      ]);

      // If the comment author is not the author of the parent comment, then create a comment reply notification
      if (commentAuthor.accountId !== recipientUser.accountId) {
        await createCommentNotification(
          context,
          { actorId: recipientUser.accountId },
          {
            ownedById: recipientUser.accountId as OwnedById,
            triggeredByUser: commentAuthor,
            triggeredByComment: comment,
            occurredInEntity: occurredInPage,
            repliedToComment: parentComment,
          },
        );
      }
    }
  }

  return entity;
};

export const afterCreateEntityHooks: CreateEntityHook[] = [
  {
    entityTypeId: types.entityType.comment.entityTypeId,
    callback: commentCreateHookCallback,
  },
];
