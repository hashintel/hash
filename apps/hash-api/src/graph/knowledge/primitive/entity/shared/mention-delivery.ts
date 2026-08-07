import { backOff } from "exponential-backoff";
import sanitizeHtml from "sanitize-html";

import {
  extractBaseUrl,
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { getOpportunityStatusUpdateHref } from "@local/hash-isomorphic-utils/supply-chain-paths";

import { getWebShortname } from "../../../../ontology/primitive/util";
import {
  createMentionNotification,
  getMentionNotification,
} from "../../../system-types/notification";
import { checkPermissionsOnEntity } from "../../entity";

import type { ImpureGraphContext } from "../../../../context-types";
import type { Block } from "../../../system-types/block";
import type { Comment } from "../../../system-types/comment";
import type { Text } from "../../../system-types/text";
import type { User } from "../../../system-types/user";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { OpportunityStatusUpdate } from "@local/hash-isomorphic-utils/system-types/opportunitystatusupdate";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

export type MentionDeliveryTarget = {
  occurredInEntity: { entity: HashEntity };
  occurredInBlock?: Block;
  occurredInComment?: Comment;
  occurredInText?: Text;
};

export const textualContentToPlainText = (
  textualContent: TextToken[],
  mentionedUsers: User[],
): string => {
  const usersByEntityId = new Map(
    mentionedUsers.map((user) => [
      user.entity.metadata.recordId.entityId,
      user,
    ]),
  );

  return textualContent
    .map((token) => {
      switch (token.tokenType) {
        case "hardBreak":
          return "\n";
        case "mention": {
          const user = usersByEntityId.get(token.entityId);
          return `@${user?.shortname ?? user?.displayName ?? "user"}`;
        }
        case "text":
          return token.text;
        default:
          return "";
      }
    })
    .join("")
    .trim();
};

const mentionTargetUrl = async ({
  authentication,
  context,
  target,
}: {
  authentication: AuthenticationContext;
  context: ImpureGraphContext;
  target: MentionDeliveryTarget;
}): Promise<string> => {
  const targetEntity = target.occurredInEntity.entity;
  const isOpportunityStatus = targetEntity.metadata.entityTypeIds.some(
    (entityTypeId) =>
      extractBaseUrl(entityTypeId) ===
      systemEntityTypes.opportunityStatusUpdate.entityTypeBaseUrl,
  );

  if (isOpportunityStatus) {
    const { scopeKey, siteCode } = simplifyProperties(
      targetEntity.properties as OpportunityStatusUpdate["properties"],
    );
    if (typeof scopeKey === "string" && typeof siteCode === "string") {
      return `${frontendUrl}${getOpportunityStatusUpdateHref({
        scopeKey,
        siteCode,
        statusUpdateEntityId: targetEntity.metadata.recordId.entityId,
      })}`;
    }
  }

  if (includesPageEntityTypeId(targetEntity.metadata.entityTypeIds)) {
    const webId = extractWebIdFromEntityId(
      targetEntity.metadata.recordId.entityId,
    );
    const shortname = await getWebShortname(context, authentication, {
      accountOrAccountGroupId: webId,
    });
    const blockHash = target.occurredInBlock
      ? `#entity-${target.occurredInBlock.entity.metadata.recordId.entityId}`
      : "";
    return `${frontendUrl}/@${shortname}/${extractEntityUuidFromEntityId(
      targetEntity.metadata.recordId.entityId,
    )}${blockHash}`;
  }

  return `${frontendUrl}/notifications`;
};

const sendMentionEmail = async ({
  authentication,
  context,
  deliveryKind,
  plainText,
  recipient,
  target,
  triggeredByUser,
}: {
  authentication: AuthenticationContext;
  context: ImpureGraphContext;
  deliveryKind: "mention" | "participation";
  plainText: string;
  recipient: User;
  target: MentionDeliveryTarget;
  triggeredByUser: User;
}): Promise<void> => {
  const emailTransporter = context.emailTransporter;
  const [recipientEmail] = recipient.emails;
  if (!emailTransporter || !recipientEmail) {
    return;
  }

  const isStatusMention =
    target.occurredInEntity.entity.metadata.entityTypeIds.some(
      (entityTypeId) =>
        extractBaseUrl(entityTypeId) ===
        systemEntityTypes.opportunityStatusUpdate.entityTypeBaseUrl,
    );
  const statusProperties = isStatusMention
    ? simplifyProperties(
        target.occurredInEntity.entity
          .properties as OpportunityStatusUpdate["properties"],
      )
    : null;
  const opportunityTitle =
    statusProperties && typeof statusProperties.title === "string"
      ? statusProperties.title
      : null;
  const opportunitySiteCode =
    statusProperties && typeof statusProperties.siteCode === "string"
      ? statusProperties.siteCode
      : null;
  const opportunityDescription = opportunityTitle
    ? `${opportunityTitle}${
        opportunitySiteCode ? ` at ${opportunitySiteCode}` : ""
      }`
    : null;
  const targetDescription = isStatusMention
    ? "a supply-chain status update"
    : includesPageEntityTypeId(
          target.occurredInEntity.entity.metadata.entityTypeIds,
        )
      ? "a page"
      : "an entity";
  const url = await mentionTargetUrl({ authentication, context, target });
  const triggeredByName = sanitizeHtml(
    triggeredByUser.displayName ?? triggeredByUser.shortname ?? "Someone",
    { allowedAttributes: {}, allowedTags: [] },
  );
  const safeText = sanitizeHtml(plainText, {
    allowedAttributes: {},
    allowedTags: [],
  });
  const safeOpportunityDescription = opportunityDescription
    ? sanitizeHtml(opportunityDescription, {
        allowedAttributes: {},
        allowedTags: [],
      })
    : null;
  const isParticipationUpdate = deliveryKind === "participation";
  const subject = isParticipationUpdate
    ? `New update to ${
        opportunityDescription ?? "an opportunity you're involved in"
      }`
    : isStatusMention
      ? `You were mentioned in an update to ${
          opportunityDescription ?? "an opportunity"
        }`
      : `You were mentioned in ${targetDescription}`;
  const introduction = isParticipationUpdate
    ? `<p><strong>${triggeredByName}</strong> added an update to ${
        safeOpportunityDescription
          ? `<strong>${safeOpportunityDescription}</strong>`
          : "an opportunity you're involved in"
      }.</p>`
    : `<p><strong>${triggeredByName}</strong> mentioned you in ${
        isStatusMention
          ? `an update to ${
              safeOpportunityDescription
                ? `<strong>${safeOpportunityDescription}</strong>`
                : "an opportunity"
            }`
          : targetDescription
      }.</p>`;

  await backOff(
    () =>
      emailTransporter.sendMail({
        to: recipientEmail,
        subject,
        html: [
          introduction,
          safeText
            ? `<blockquote>${safeText.replaceAll("\n", "<br>")}</blockquote>`
            : "",
          `<p><a href="${url}">${
            isParticipationUpdate ? "View update" : "View mention"
          }</a></p>`,
        ].join(""),
      }),
    {
      maxDelay: 1_000,
      numOfAttempts: 3,
      startingDelay: 100,
      timeMultiple: 2,
    },
  );
};

const deliverNotifications = async ({
  authentication,
  context,
  deliveryKind,
  recipients,
  target,
  textualContent,
  triggeredByUser,
  usersForPlainText,
}: {
  authentication: AuthenticationContext;
  context: ImpureGraphContext;
  deliveryKind: "mention" | "participation";
  recipients: User[];
  target: MentionDeliveryTarget;
  textualContent: TextToken[];
  triggeredByUser: User;
  usersForPlainText: User[];
}): Promise<void> => {
  const plainText = textualContentToPlainText(
    textualContent,
    usersForPlainText,
  );
  const uniqueRecipients = [
    ...new Map(
      recipients.map((user) => [user.entity.metadata.recordId.entityId, user]),
    ).values(),
  ].filter((user) => user.accountId !== triggeredByUser.accountId);

  const results = await Promise.allSettled(
    uniqueRecipients.map(async (recipient) => {
      const { view } = await checkPermissionsOnEntity(
        context,
        { actorId: recipient.accountId },
        { entity: target.occurredInEntity.entity },
      );
      if (!view) {
        return;
      }

      const existingNotification = await getMentionNotification(
        context,
        { actorId: recipient.accountId },
        {
          recipient,
          triggeredByUser,
          ...target,
        },
      );
      if (existingNotification) {
        return;
      }

      await createMentionNotification(
        context,
        { actorId: recipient.accountId },
        {
          webId: recipient.accountId,
          triggeredByUser,
          ...target,
        },
      );
      await sendMentionEmail({
        authentication,
        context,
        deliveryKind,
        plainText,
        recipient,
        target,
        triggeredByUser,
      });
    }),
  );

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      context.logger?.error("Failed to deliver mention notification", {
        deliveryKind,
        error: result.reason,
        recipientEntityId:
          uniqueRecipients[index]?.entity.metadata.recordId.entityId,
        targetEntityId:
          target.occurredInEntity.entity.metadata.recordId.entityId,
      });
    }
  }
};

export const deliverMentionNotifications = async ({
  authentication,
  context,
  mentionedUsers,
  target,
  textualContent,
  triggeredByUser,
}: {
  authentication: AuthenticationContext;
  context: ImpureGraphContext;
  mentionedUsers: User[];
  target: MentionDeliveryTarget;
  textualContent: TextToken[];
  triggeredByUser: User;
}): Promise<void> =>
  deliverNotifications({
    authentication,
    context,
    deliveryKind: "mention",
    recipients: mentionedUsers,
    target,
    textualContent,
    triggeredByUser,
    usersForPlainText: mentionedUsers,
  });

export const deliverStatusParticipationNotifications = async ({
  authentication,
  context,
  mentionedUsers,
  participants,
  target,
  textualContent,
  triggeredByUser,
}: {
  authentication: AuthenticationContext;
  context: ImpureGraphContext;
  mentionedUsers: User[];
  participants: User[];
  target: MentionDeliveryTarget;
  textualContent: TextToken[];
  triggeredByUser: User;
}): Promise<void> =>
  deliverNotifications({
    authentication,
    context,
    deliveryKind: "participation",
    recipients: participants,
    target,
    textualContent,
    triggeredByUser,
    usersForPlainText: mentionedUsers,
  });
