import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { TextToken } from "@local/hash-isomorphic-utils/types";
import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import {
  archiveNotification,
  createMentionNotification,
  getMentionNotification,
} from "../../../system-types/notification";
import {
  getMentionedUsersInTextualContent,
  getTextFromEntity,
} from "../../../system-types/text";
import { getUserById } from "../../../system-types/user";
import { checkPermissionsOnEntity } from "../../entity";
import { getTextUpdateOccurredIn } from "../shared/mention-notification";
import { UpdateEntityHookCallback } from "../update-entity-hooks";

/**
 * This after update `Text` entity hook is responsible for creating
 * mention notifications if the textual content contain a mention to a user and:
 * - the `Text` entity is in a page
 * - the `Text` entity is in a comment that's on a page
 */
export const textAfterUpdateEntityHookCallback: UpdateEntityHookCallback =
  async ({ entity, updatedProperties, authentication, context }) => {
    const text = getTextFromEntity({ entity });

    const { occurredInComment, occurredInEntity, occurredInBlock } =
      await getTextUpdateOccurredIn(context, authentication, {
        text,
      });

    if (!occurredInEntity || !occurredInBlock) {
      return;
    }

    const previousTextualContent = text.textualContent;

    const updatedTextualContent = updatedProperties[
      extractBaseUrl(blockProtocolPropertyTypes.textualContent.propertyTypeId)
    ] as TextToken[];

    /** @todo: check whether textual content has changed before performing expensive operations */

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
