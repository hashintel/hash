import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@local/hash-subgraph";

import { SYSTEM_TYPES } from "../../../system-types";
import { getBlockCollectionByBlock } from "../../system-types/block";
import { getCommentAncestorBlock } from "../../system-types/comment";
import {
  archiveNotification,
  createMentionNotification,
  getMentionNotification,
} from "../../system-types/notification";
import { getPageFromEntity } from "../../system-types/page";
import {
  getCommentByText,
  getMentionedUsersInTextTokens,
  getPageByText,
  getTextFromEntity,
} from "../../system-types/text";
import { getUserById } from "../../system-types/user";
import {
  UpdateEntityHook,
  UpdateEntityHookCallback,
} from "./update-entity-hooks";

const textEntityUpdateHookCallback: UpdateEntityHookCallback = async ({
  entity,
  updatedProperties,
  authentication,
  context,
}) => {
  const text = getTextFromEntity({ entity });

  let occurredInPage = await getPageByText(context, authentication, { text });

  const occurredInComment = !occurredInPage
    ? (await getCommentByText(context, authentication, { text })) ?? undefined
    : undefined;

  if (occurredInComment) {
    const commentAncestorBlock = await getCommentAncestorBlock(
      context,
      authentication,
      { commentEntityId: occurredInComment.entity.metadata.recordId.entityId },
    );

    const blockCollectionEntity = await getBlockCollectionByBlock(
      context,
      authentication,
      {
        block: commentAncestorBlock,
      },
    );

    if (
      blockCollectionEntity &&
      blockCollectionEntity.metadata.entityTypeId ===
        SYSTEM_TYPES.entityType.page.schema.$id
    ) {
      occurredInPage = getPageFromEntity({ entity: blockCollectionEntity });
    }
  }

  if (!occurredInPage) {
    return;
  }

  const previousTokens = entity.properties[
    SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl
  ] as TextToken[];

  const updatedTokens = updatedProperties[
    SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl
  ] as TextToken[];

  /** @todo: check whether tokens have changed before performing expensive operations */

  const [previousMentionedUsers, updatedMentionedUsers] = await Promise.all([
    getMentionedUsersInTextTokens(context, authentication, {
      tokens: previousTokens,
    }),
    getMentionedUsersInTextTokens(context, authentication, {
      tokens: updatedTokens,
    }),
  ]);

  const addedMentionedUsers = updatedMentionedUsers.filter(
    (user) =>
      !previousMentionedUsers.some(
        (previousUser) =>
          previousUser.entity.metadata.recordId.entityId ===
          user.entity.metadata.recordId.entityId,
      ),
  );

  const removedMentionedUsers = previousMentionedUsers.filter(
    (previousUser) =>
      !updatedMentionedUsers.some(
        (user) =>
          user.entity.metadata.recordId.entityId ===
          previousUser.entity.metadata.recordId.entityId,
      ),
  );

  const triggeredByUser = await getUserById(context, authentication, {
    entityId: entityIdFromOwnedByIdAndEntityUuid(
      authentication.actorId as OwnedById,
      authentication.actorId as string as EntityUuid,
    ),
  });

  await Promise.all([
    ...removedMentionedUsers.map(async (removedMentionedUser) => {
      const existingNotification = await getMentionNotification(
        context,
        { actorId: removedMentionedUser.accountId },
        {
          recipient: removedMentionedUser,
          triggeredByUser,
          occurredInEntity: occurredInPage!,
          occurredInComment,
          occurredInText: text,
        },
      );

      if (existingNotification) {
        await archiveNotification(
          context,
          { actorId: removedMentionedUser.accountId },
          { notification: existingNotification },
        );
      }
    }),
    ...addedMentionedUsers.map(async (addedMentionedUser) => {
      /** @todo: check if notification already exists */

      const existingNotification = await getMentionNotification(
        context,
        /** @todo: use authentication of machine user instead */
        { actorId: addedMentionedUser.accountId },
        {
          recipient: addedMentionedUser,
          triggeredByUser,
          occurredInEntity: occurredInPage!,
          occurredInComment,
          occurredInText: text,
        },
      );

      if (!existingNotification) {
        await createMentionNotification(
          context,
          /** @todo: use authentication of machine user instead */
          { actorId: addedMentionedUser.accountId },
          {
            ownedById: addedMentionedUser.accountId as OwnedById,
            occurredInEntity: occurredInPage!,
            occurredInComment,
            occurredInText: text,
            triggeredByUser,
          },
        );
      }
    }),
  ]);
};

export const afterUpdateEntityHooks: UpdateEntityHook[] = [
  {
    entityTypeId: types.entityType.text.entityTypeId,
    callback: textEntityUpdateHookCallback,
  },
];
