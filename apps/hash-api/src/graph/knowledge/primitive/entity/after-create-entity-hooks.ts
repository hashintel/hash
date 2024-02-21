import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";

import { isProdEnv } from "../../../../lib/env-config";
import { createOrUpdateMailchimpUser } from "../../../../mailchimp";
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
import { getPageFromEntity } from "../../system-types/page";
import {
  getMentionedUsersInTextualContent,
  getTextById,
} from "../../system-types/text";
import { getUserById } from "../../system-types/user";
import { checkPermissionsOnEntity } from "../entity";
import {
  AfterCreateEntityHook,
  AfterCreateEntityHookCallback,
} from "./create-entity-hooks";
import { getTextUpdateOccurredIn } from "./shared/mention-notification";

/**
 * This after create `Comment` entity hook is responsible for creating
 * comment notifications if:
 * - the parent of the comment is a block on a page
 * - the parent of the comment is another comment (i.e the comment is a reply)
 */
const commentCreateHookCallback: AfterCreateEntityHookCallback = async ({
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
    commentParent.metadata.entityTypeId === systemEntityTypes.block.entityTypeId
  ) {
    const parentBlock = getBlockFromEntity({ entity: commentParent });
    const blockCollectionEntity = await getBlockCollectionByBlock(
      context,
      authentication,
      { block: parentBlock },
    );

    if (
      blockCollectionEntity &&
      isPageEntityTypeId(blockCollectionEntity.metadata.entityTypeId)
    ) {
      const occurredInEntity = getPageFromEntity({
        entity: blockCollectionEntity,
      });

      const pageAuthorAccountId =
        occurredInEntity.entity.metadata.provenance.createdById;

      const pageAuthor = await getUserById(context, authentication, {
        entityId: entityIdFromOwnedByIdAndEntityUuid(
          pageAuthorAccountId as Uuid as OwnedById,
          pageAuthorAccountId as Uuid as EntityUuid,
        ),
      });

      const commentAuthor = await getCommentAuthor(context, authentication, {
        commentEntityId: comment.entity.metadata.recordId.entityId,
      });

      const { view: pageAuthorCanViewPage } = await checkPermissionsOnEntity(
        context,
        { actorId: pageAuthor.accountId },
        { entity: occurredInEntity.entity },
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
            occurredInEntity,
            occurredInBlock: parentBlock,
          },
        );
      }
    }
    // If the parent is another comment check if we need to create a comment reply notification
  } else if (
    commentParent.metadata.entityTypeId ===
    systemEntityTypes.comment.entityTypeId
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
      isPageEntityTypeId(blockCollectionEntity.metadata.entityTypeId)
    ) {
      const occurredInEntity = getPageFromEntity({
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
          { entity: occurredInEntity.entity },
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
            occurredInEntity,
            occurredInBlock: ancestorBlock,
            repliedToComment: parentComment,
          },
        );
      }
    }
  }
};

/**
 * This after create `hasText` link entity hook is responsible for creating
 * mention notifications if the right entity is a `Text` entity whose textual
 * content contains a mention to a user, and:
 * - the `Text` is in a page
 * - the `Text` is in a comment that's on a page
 */
const hasTextCreateHookCallback: AfterCreateEntityHookCallback = async ({
  entity,
  authentication,
  context,
}) => {
  const text = await getTextById(context, authentication, {
    entityId: entity.linkData!.rightEntityId,
  });

  const { occurredInComment, occurredInEntity, occurredInBlock } =
    await getTextUpdateOccurredIn(context, authentication, {
      text,
    });

  if (!occurredInEntity || !occurredInBlock) {
    return undefined;
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
            { entity: occurredInEntity.entity },
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
            occurredInEntity,
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
              occurredInEntity,
              occurredInBlock,
              occurredInComment,
              occurredInText: text,
              triggeredByUser,
            },
          );
        }
      }),
  ]);
};

const userCreateHookCallback: AfterCreateEntityHookCallback = async ({
  entity,
}) => {
  if (isProdEnv) {
    const {
      email: emails,
      shortname,
      displayName,
    } = simplifyProperties(entity.properties as UserProperties);

    /**
     * @todo: when we allow users to have more than one email, come up with
     * a better way of determining which to use for mailchimp.
     */
    const [email] = emails;

    await createOrUpdateMailchimpUser({
      email,
      shortname,
      displayName,
    });
  }
};

export const afterCreateEntityHooks: AfterCreateEntityHook[] = [
  {
    entityTypeId: systemEntityTypes.comment.entityTypeId,
    callback: commentCreateHookCallback,
  },
  {
    entityTypeId: systemLinkEntityTypes.hasText.linkEntityTypeId,
    callback: hasTextCreateHookCallback,
  },
  {
    entityTypeId: systemEntityTypes.user.entityTypeId,
    callback: userCreateHookCallback,
  },
];
