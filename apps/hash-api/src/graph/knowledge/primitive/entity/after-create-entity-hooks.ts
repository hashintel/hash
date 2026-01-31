import type { EntityUuid, WebId } from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/user";

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
import { getUser } from "../../system-types/user";
import { checkPermissionsOnEntity } from "../entity";
import type {
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
    commentParent.metadata.entityTypeIds.includes(
      systemEntityTypes.block.entityTypeId,
    )
  ) {
    const parentBlock = getBlockFromEntity({ entity: commentParent });
    const blockCollectionEntity = await getBlockCollectionByBlock(
      context,
      authentication,
      { block: parentBlock },
    );

    if (
      blockCollectionEntity &&
      includesPageEntityTypeId(blockCollectionEntity.metadata.entityTypeIds)
    ) {
      const occurredInEntity = getPageFromEntity({
        entity: blockCollectionEntity,
      });

      const pageAuthorAccountId =
        occurredInEntity.entity.metadata.provenance.createdById;

      const pageAuthorEntityId = entityIdFromComponents(
        pageAuthorAccountId as WebId,
        pageAuthorAccountId as string as EntityUuid,
      );
      const pageAuthor = await getUser(context, authentication, {
        entityId: pageAuthorEntityId,
      });
      if (!pageAuthor) {
        throw new Error(
          `User with entityId ${pageAuthorEntityId} doesn't exist or cannot be accessed by requesting user.`,
        );
      }

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
            webId: pageAuthor.accountId,
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
    commentParent.metadata.entityTypeIds.includes(
      systemEntityTypes.comment.entityTypeId,
    )
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
      includesPageEntityTypeId(blockCollectionEntity.metadata.entityTypeIds)
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
            webId: parentCommentAuthor.accountId,
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

  const triggeredByUserEntityId = entityIdFromComponents(
    authentication.actorId as WebId,
    authentication.actorId as string as EntityUuid,
  );
  const triggeredByUser = await getUser(context, authentication, {
    entityId: triggeredByUserEntityId,
  });
  if (!triggeredByUser) {
    throw new Error(
      `User with entityId ${triggeredByUserEntityId} doesn't exist or cannot be accessed by requesting user.`,
    );
  }

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
              webId: mentionedUser.accountId,
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
     * @todo H-4936: when we allow users to have more than one email, come up with
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
