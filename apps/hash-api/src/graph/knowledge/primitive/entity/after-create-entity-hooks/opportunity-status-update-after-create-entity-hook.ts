import { entityIdFromComponents } from "@blockprotocol/type-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { getMentionedUsersInTextualContent } from "../../../system-types/text";
import { getUser } from "../../../system-types/user";
import { deliverMentionNotifications } from "../shared/mention-delivery";

import type { AfterCreateEntityHookCallback } from "../create-entity-hooks";
import type { EntityUuid, WebId } from "@blockprotocol/type-system";
import type { OpportunityStatusUpdate } from "@local/hash-isomorphic-utils/system-types/opportunitystatusupdate";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

export const opportunityStatusUpdateAfterCreateEntityHookCallback: AfterCreateEntityHookCallback =
  async ({ authentication, context, entity }) => {
    const { textualContent } = simplifyProperties(
      entity.properties as OpportunityStatusUpdate["properties"],
    );
    if (!Array.isArray(textualContent) || !textualContent.length) {
      return;
    }
    const statusTokens = textualContent as unknown as TextToken[];

    const [triggeredByUser, mentionedUsers] = await Promise.all([
      getUser(context, authentication, {
        entityId: entityIdFromComponents(
          authentication.actorId as WebId,
          authentication.actorId as string as EntityUuid,
        ),
      }),
      getMentionedUsersInTextualContent(context, authentication, {
        textualContent: statusTokens,
      }),
    ]);

    if (!triggeredByUser) {
      throw new Error(
        `User ${authentication.actorId} does not exist or cannot be accessed.`,
      );
    }

    await deliverMentionNotifications({
      authentication,
      context,
      mentionedUsers,
      target: { occurredInEntity: { entity } },
      textualContent: statusTokens,
      triggeredByUser,
    });
  };
