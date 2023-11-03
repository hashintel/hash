import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@local/hash-subgraph";

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
import {
  createCommentNotification,
  createMentionNotification,
  getMentionNotification,
} from "../../system-types/notification";
import { getPageAuthor, getPageFromEntity } from "../../system-types/page";
import {
  getMentionedUsersInTextualContent,
  getTextById,
} from "../../system-types/text";
import { getUserById } from "../../system-types/user";
import { checkPermissionsOnEntity } from "../entity";
import {
  CreateEntityHook,
  CreateEntityHookCallback,
} from "./create-entity-hooks";
import { getTextUpdateOccurredIn } from "./shared/mention-notification";

/**
 * This after create `Comment` entity hook is responsible for creating
 * comment notifications if:
 * - the parent of the comment is a block on a page
 * - the parent of the comment is another comment (i.e the comment is a reply)
 */
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

      const pageAuthor = await getPageAuthor(context, authentication, {
        pageEntityId: occurredInPage.entity.metadata.recordId.entityId,
      });

      const commentAuthor = await getCommentAuthor(context, authentication, {
        commentEntityId: comment.entity.metadata.recordId.entityId,
      });

      const { view: pageAuthorCanViewPage } = await checkPermissionsOnEntity(
        context,
        { actorId: pageAuthor.accountId },
        { entity: occurredInPage.entity },
      );

      // If the comment author is not the page creator, and the page
      // creator can view the page, then create a page comment notification
      if (
        commentAuthor.accountId !== pageAuthor.accountId &&
        pageAuthorCanViewPage
      ) {
        await createCommentNotification(
          context,
          { actorId: pageAuthor.accountId },
          {
            ownedById: pageAuthor.accountId as OwnedById,
            triggeredByUser: commentAuthor,
            triggeredByComment: comment,
            occurredInPage,
            occurredInBlock: parentBlock,
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

      const [commentAuthor, parentCommentAuthor] = await Promise.all([
        getCommentAuthor(context, authentication, {
          commentEntityId: comment.entity.metadata.recordId.entityId,
        }),
        getCommentAuthor(context, authentication, {
          commentEntityId: parentComment.entity.metadata.recordId.entityId,
        }),
      ]);

      const { view: parentCommentAuthorCanViewPage } =
        await checkPermissionsOnEntity(
          context,
          { actorId: parentCommentAuthor.accountId },
          { entity: occurredInPage.entity },
        );

      // If the comment author is not the parent comment author, and the
      // parent comment author can view the page, then create a comment
      // reply notification
      if (
        commentAuthor.accountId !== parentCommentAuthor.accountId &&
        parentCommentAuthorCanViewPage
      ) {
        await createCommentNotification(
          context,
          { actorId: parentCommentAuthor.accountId },
          {
            ownedById: parentCommentAuthor.accountId as OwnedById,
            triggeredByUser: commentAuthor,
            triggeredByComment: comment,
            occurredInPage,
            occurredInBlock: ancestorBlock,
            repliedToComment: parentComment,
          },
        );
      }
    }
  }

  return entity;
};

/**
 * This after create `hasText` link entity hook is responsible for creating
 * mention notifications if the right entity is a `Text` entity whose textual
 * content contains a mention to a user, and:
 * - the `Text` is in a page
 * - the `Text` is in a comment that's on a page
 */
const hasTextCreateHookCallback: CreateEntityHookCallback = async ({
  entity,
  authentication,
  context,
}) => {
  const text = await getTextById(context, authentication, {
    entityId: entity.linkData!.rightEntityId,
  });

  const { occurredInComment, occurredInPage, occurredInBlock } =
    await getTextUpdateOccurredIn(context, authentication, {
      text,
    });

  if (!occurredInPage || !occurredInBlock) {
    return entity;
  }

  const { textualContent } = text;

  const mentionedUsers = await getMentionedUsersInTextualContent(
    context,
    authentication,
    { textualContent },
  );

  const triggeredByUser = await getUserById(context, authentication, {
    entityId: entityIdFromOwnedByIdAndEntityUuid(
      authentication.actorId as OwnedById,
      authentication.actorId as string as EntityUuid,
    ),
  });

  await Promise.all([
    ...mentionedUsers
      .filter((user) => user.accountId !== triggeredByUser.accountId)
      .map(async (mentionedUser) => {
        const { view: mentionedUserCanViewPage } =
          await checkPermissionsOnEntity(
            context,
            { actorId: mentionedUser.accountId },
            { entity: occurredInPage.entity },
          );

        if (!mentionedUserCanViewPage) {
          return;
        }

        const existingNotification = await getMentionNotification(
          context,
          /** @todo: use authentication of machine user instead */
          { actorId: mentionedUser.accountId },
          {
            recipient: mentionedUser,
            triggeredByUser,
            occurredInPage,
            occurredInComment,
            occurredInBlock,
            occurredInText: text,
          },
        );

        if (!existingNotification) {
          await createMentionNotification(
            context,
            /** @todo: use authentication of machine user instead */
            { actorId: mentionedUser.accountId },
            {
              ownedById: mentionedUser.accountId as OwnedById,
              occurredInPage,
              occurredInBlock,
              occurredInComment,
              occurredInText: text,
              triggeredByUser,
            },
          );
        }
      }),
  ]);

  return entity;
};

export const afterCreateEntityHooks: CreateEntityHook[] = [
  {
    entityTypeId: types.entityType.comment.entityTypeId,
    callback: commentCreateHookCallback,
  },
  {
    entityTypeId: types.linkEntityType.hasText.linkEntityTypeId,
    callback: hasTextCreateHookCallback,
  },
];
