import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@local/hash-subgraph";

import {
  archiveNotification,
  createMentionNotification,
  getMentionNotification,
} from "../../../../graph/knowledge/system-types/notification";
import {
  getMentionedUsersInTextTokens,
  getPageByText,
  getTextFromEntity,
} from "../../../../graph/knowledge/system-types/text";
import { getUserById } from "../../../../graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "../../../../graph/system-types";
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

  const page = await getPageByText(context, authentication, { text });

  if (!page) {
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
          occurredInEntity: page,
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
          occurredInEntity: page,
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
            occurredInEntity: page,
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
