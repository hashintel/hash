import {
  entityIdFromComponents,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { getMentionedUsersInTextualContent } from "../../../system-types/text";
import { getUser } from "../../../system-types/user";
import {
  deliverMentionNotifications,
  deliverStatusParticipationNotifications,
} from "../shared/mention-delivery";

import type { AfterCreateEntityHookCallback } from "../create-entity-hooks";
import type { EntityUuid, WebId } from "@blockprotocol/type-system";
import type { OpportunityStatusUpdate } from "@local/hash-isomorphic-utils/system-types/opportunitystatusupdate";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

export const opportunityStatusUpdateAfterCreateEntityHookCallback: AfterCreateEntityHookCallback =
  async ({ authentication, context, entity }) => {
    const { scopeKey, textualContent } = simplifyProperties(
      entity.properties as OpportunityStatusUpdate["properties"],
    );
    const statusTokens = Array.isArray(textualContent)
      ? (textualContent as unknown as TextToken[])
      : [];

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

    const mentionedAccountIds = new Set<string>(
      mentionedUsers.map((mentionedUser) => mentionedUser.accountId),
    );
    const participants =
      typeof scopeKey === "string"
        ? await queryEntities(context, authentication, {
            filter: {
              all: [
                {
                  equal: [
                    { path: ["type", "baseUrl"] },
                    {
                      parameter:
                        systemEntityTypes.opportunityStatusUpdate
                          .entityTypeBaseUrl,
                    },
                  ],
                },
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        systemPropertyTypes.scopeKey.propertyTypeBaseUrl,
                      ],
                    },
                    { parameter: scopeKey },
                  ],
                },
                {
                  equal: [
                    { path: ["webId"] },
                    {
                      parameter: extractWebIdFromEntityId(
                        entity.metadata.recordId.entityId,
                      ),
                    },
                  ],
                },
              ],
            },
            temporalAxes: currentTimeInstantTemporalAxes,
            includeDrafts: false,
            includePermissions: false,
          }).then(async ({ entities }) => {
            const participantAccountIds = new Set(
              entities
                .filter(
                  (statusEntity) =>
                    statusEntity.metadata.provenance.createdAtDecisionTime <
                    entity.metadata.provenance.createdAtDecisionTime,
                )
                .map(
                  (statusEntity) =>
                    statusEntity.metadata.provenance.createdById,
                )
                .filter(
                  (accountId) =>
                    accountId !== triggeredByUser.accountId &&
                    !mentionedAccountIds.has(accountId),
                ),
            );
            const participantUsers = await Promise.all(
              [...participantAccountIds].map((accountId) =>
                getUser(context, authentication, {
                  entityId: entityIdFromComponents(
                    accountId as WebId,
                    accountId as string as EntityUuid,
                  ),
                }),
              ),
            );
            return participantUsers.filter(
              (participant) => participant !== null,
            );
          })
        : [];

    await Promise.all([
      deliverMentionNotifications({
        authentication,
        context,
        mentionedUsers,
        target: { occurredInEntity: { entity } },
        textualContent: statusTokens,
        triggeredByUser,
      }),
      deliverStatusParticipationNotifications({
        authentication,
        context,
        mentionedUsers,
        participants,
        target: { occurredInEntity: { entity } },
        textualContent: statusTokens,
        triggeredByUser,
      }),
    ]);
  };
