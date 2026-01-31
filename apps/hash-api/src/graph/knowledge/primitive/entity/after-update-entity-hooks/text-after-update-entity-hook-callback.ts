import type { EntityUuid, WebId } from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import { getDefinedPropertyFromPatchesGetter } from "@local/hash-graph-sdk/entity";
import type { TextProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

import {
  archiveNotification,
  createMentionNotification,
  getMentionNotification,
} from "../../../system-types/notification";
import {
  getMentionedUsersInTextualContent,
  getTextFromEntity,
} from "../../../system-types/text";
import { getUser } from "../../../system-types/user";
import { checkPermissionsOnEntity } from "../../entity";
import { getTextUpdateOccurredIn } from "../shared/mention-notification";
import type { AfterUpdateEntityHookCallback } from "../update-entity-hooks";

/**
 * This after update `Text` entity hook is responsible for creating
 * mention notifications if the textual content contain a mention to a user and:
 * - the `Text` entity is in a page
 * - the `Text` entity is in a comment that's on a page
 */
export const textAfterUpdateEntityHookCallback: AfterUpdateEntityHookCallback =
  async ({ previousEntity, propertyPatches, authentication, context }) => {
    const getNewValueForPath =
      getDefinedPropertyFromPatchesGetter<TextProperties>(propertyPatches);

    const newTextValue = getNewValueForPath(
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/",
    );

    if (!newTextValue || typeof newTextValue === "string") {
      return;
    }

    const updatedTextualContent = newTextValue as TextToken[];

    const text = getTextFromEntity({ entity: previousEntity });

    const { occurredInComment, occurredInEntity, occurredInBlock } =
      await getTextUpdateOccurredIn(context, authentication, {
        text,
      });

    if (!occurredInEntity || !occurredInBlock) {
      return;
    }

    const previousTextualContent = text.textualContent;

    const [previousMentionedUsers, updatedMentionedUsers] = await Promise.all([
      getMentionedUsersInTextualContent(context, authentication, {
        textualContent: previousTextualContent,
      }),
      getMentionedUsersInTextualContent(context, authentication, {
        textualContent: updatedTextualContent,
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
      ...removedMentionedUsers.map(async (removedMentionedUser) => {
        const existingNotification = await getMentionNotification(
          context,
          { actorId: removedMentionedUser.accountId },
          {
            recipient: removedMentionedUser,
            triggeredByUser,
            occurredInEntity,
            occurredInComment,
            occurredInBlock,
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
      ...addedMentionedUsers
        .filter(
          (addedMentionedUser) =>
            triggeredByUser.accountId !== addedMentionedUser.accountId,
        )
        .map(async (addedMentionedUser) => {
          const { view: mentionedUserCanViewPage } =
            await checkPermissionsOnEntity(
              context,
              { actorId: addedMentionedUser.accountId },
              { entity: occurredInEntity.entity },
            );

          if (!mentionedUserCanViewPage) {
            return;
          }

          const existingNotification = await getMentionNotification(
            context,
            /** @todo: use authentication of machine user instead */
            { actorId: addedMentionedUser.accountId },
            {
              recipient: addedMentionedUser,
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
              { actorId: addedMentionedUser.accountId },
              {
                webId: addedMentionedUser.accountId,
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
