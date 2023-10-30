import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@local/hash-subgraph";

import { SYSTEM_TYPES } from "../../../system-types";
import {
  archiveNotification,
  createMentionNotification,
  getMentionNotification,
} from "../../system-types/notification";
import {
  getMentionedUsersInTextTokens,
  getTextFromEntity,
} from "../../system-types/text";
import { getUserById } from "../../system-types/user";
import { getTextUpdateOccurredInPageAndComment } from "./shared/mention-notification";
import {
  UpdateEntityHook,
  UpdateEntityHookCallback,
} from "./update-entity-hooks";

/**
 * This after update `Text` entity hook is responsible for creating
 * mention notifications if the tokens contain a mention to a user and:
 * - the `Text` entity is in a page
 * - the `Text` entity is in a comment that's on a page
 */
const textEntityUpdateHookCallback: UpdateEntityHookCallback = async ({
  entity,
  updatedProperties,
  authentication,
  context,
}) => {
  const text = getTextFromEntity({ entity });

  const { occurredInComment, occurredInPage } =
    await getTextUpdateOccurredInPageAndComment(context, authentication, {
      text,
    });

  if (!occurredInPage) {
    return;
  }

  const previousTokens = text.tokens;

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
          occurredInEntity: occurredInPage,
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
      const existingNotification = await getMentionNotification(
        context,
        /** @todo: use authentication of machine user instead */
        { actorId: addedMentionedUser.accountId },
        {
          recipient: addedMentionedUser,
          triggeredByUser,
          occurredInEntity: occurredInPage,
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
            occurredInEntity: occurredInPage,
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
