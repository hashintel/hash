import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  blockProtocolPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { opportunityStatusUpdateAfterCreateEntityHookCallback } from "./opportunity-status-update-after-create-entity-hook";

import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const mocks = vi.hoisted(() => ({
  deliverMentionNotifications: vi.fn(),
  deliverStatusParticipationNotifications: vi.fn(),
  getMentionedUsersInTextualContent: vi.fn(),
  getUser: vi.fn(),
  queryEntities: vi.fn(),
}));

vi.mock("@local/hash-graph-sdk/entity", () => ({
  queryEntities: mocks.queryEntities,
}));

vi.mock("../../../system-types/text", () => ({
  getMentionedUsersInTextualContent: mocks.getMentionedUsersInTextualContent,
}));

vi.mock("../../../system-types/user", () => ({
  getUser: mocks.getUser,
}));

vi.mock("../shared/mention-delivery", () => ({
  deliverMentionNotifications: mocks.deliverMentionNotifications,
  deliverStatusParticipationNotifications:
    mocks.deliverStatusParticipationNotifications,
}));

const authorAccountId = "00000000-0000-0000-0000-000000000001";
const mentionedAccountId = "00000000-0000-0000-0000-000000000002";
const participantAccountId = "00000000-0000-0000-0000-000000000003";
const user = (accountId: string) =>
  ({
    accountId,
    entity: {
      metadata: {
        recordId: { entityId: `${accountId}~${accountId}` as EntityId },
      },
    },
  }) as never;

describe("opportunity status update after-create hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deliverMentionNotifications.mockResolvedValue(undefined);
    mocks.deliverStatusParticipationNotifications.mockResolvedValue(undefined);
    mocks.getMentionedUsersInTextualContent.mockResolvedValue([
      user(mentionedAccountId),
    ]);
    mocks.getUser.mockImplementation(
      (_context, _authentication, { entityId }: { entityId: EntityId }) => {
        const accountId = entityId.split("~")[0]!;
        return Promise.resolve(user(accountId));
      },
    );
    mocks.queryEntities.mockResolvedValue({
      entities: [
        {
          metadata: {
            provenance: {
              createdAtDecisionTime: "2026-08-06T10:00:00.000Z",
              createdById: authorAccountId,
            },
          },
        },
        {
          metadata: {
            provenance: {
              createdAtDecisionTime: "2026-08-06T10:00:00.000Z",
              createdById: mentionedAccountId,
            },
          },
        },
        {
          metadata: {
            provenance: {
              createdAtDecisionTime: "2026-08-06T10:00:00.000Z",
              createdById: participantAccountId,
            },
          },
        },
        {
          metadata: {
            provenance: {
              createdAtDecisionTime: "2026-08-06T10:00:00.000Z",
              createdById: participantAccountId,
            },
          },
        },
      ],
    });
  });

  it("notifies prior participants except the author and mentioned users", async () => {
    const entity = {
      metadata: {
        provenance: {
          createdAtDecisionTime: "2026-08-06T11:00:00.000Z",
        },
        recordId: {
          entityId:
            "00000000-0000-0000-0000-000000000004~00000000-0000-0000-0000-000000000005" as EntityId,
        },
      },
      properties: {
        [systemPropertyTypes.scopeKey.propertyTypeBaseUrl]:
          "site-1::planning::node-1",
        [blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl]: [
          {
            entityId: `${mentionedAccountId}~${mentionedAccountId}`,
            mentionType: "user",
            tokenType: "mention",
          },
        ],
      },
    } as unknown as HashEntity;

    await opportunityStatusUpdateAfterCreateEntityHookCallback({
      authentication: { actorId: authorAccountId } as never,
      context: {} as never,
      entity,
    });

    expect(mocks.deliverStatusParticipationNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        participants: [
          expect.objectContaining({ accountId: participantAccountId }),
        ],
      }),
    );
    expect(mocks.deliverMentionNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        mentionedUsers: [
          expect.objectContaining({ accountId: mentionedAccountId }),
        ],
      }),
    );
  });
});
