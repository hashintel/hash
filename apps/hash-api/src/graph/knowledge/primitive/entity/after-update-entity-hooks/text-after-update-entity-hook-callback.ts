import { getDefinedPropertyFromPatchesGetter } from "@local/hash-graph-sdk/entity";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { TextProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import { entityIdFromComponents } from "@local/hash-subgraph";

import {
  archiveNotification,
  createMentionNotification,
  getMentionNotification,
} from "../../../system-types/notification.js";
import {
  getMentionedUsersInTextualContent,
  getTextFromEntity,
} from "../../../system-types/text.js";
import { getUserById } from "../../../system-types/user.js";
import { checkPermissionsOnEntity } from "../../entity.js";
import { getTextUpdateOccurredIn } from "../shared/mention-notification.js";
import type { AfterUpdateEntityHookCallback } from "../update-entity-hooks.js";

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

    const triggeredByUser = await getUserById(context, authentication, {
      entityId: entityIdFromComponents(
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
                ownedById: addedMentionedUser.accountId as OwnedById,
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
