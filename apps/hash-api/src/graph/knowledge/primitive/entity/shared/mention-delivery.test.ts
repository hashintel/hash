import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { deliverMentionNotifications } from "./mention-delivery";

import type { ImpureGraphContext } from "../../../../context-types";
import type { User } from "../../../system-types/user";
import type { EntityId } from "@blockprotocol/type-system";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

const mocks = vi.hoisted(() => ({
  checkPermissionsOnEntity: vi.fn(),
  createMentionNotification: vi.fn(),
  getMentionNotification: vi.fn(),
  getWebShortname: vi.fn(),
}));

vi.mock("../../../system-types/notification", () => ({
  createMentionNotification: mocks.createMentionNotification,
  getMentionNotification: mocks.getMentionNotification,
}));

vi.mock("../../entity", () => ({
  checkPermissionsOnEntity: mocks.checkPermissionsOnEntity,
}));

vi.mock("../../../../ontology/primitive/util", () => ({
  getWebShortname: mocks.getWebShortname,
}));

const user = ({
  accountId,
  entityId,
}: {
  accountId: string;
  entityId: EntityId;
}): User =>
  ({
    accountId,
    displayName: accountId,
    emails: [`${accountId}@example.com`],
    entity: { metadata: { recordId: { entityId } } },
  }) as User;

const targetEntity = {
  metadata: {
    entityTypeIds: [systemEntityTypes.opportunityStatusUpdate.entityTypeId],
    recordId: {
      entityId:
        "01234567-89ab-cdef-0123-456789abcdef~12345678-90ab-cdef-1234-567890abcdef",
    },
  },
  properties: {
    [systemPropertyTypes.siteCode.propertyTypeBaseUrl]: "site-1",
    [systemPropertyTypes.scopeKey.propertyTypeBaseUrl]:
      "site-1::qa_hold::node-1",
  },
} as unknown as HashEntity;

const authentication = {
  actorId: "author-account",
} as AuthenticationContext;

const mentionEntityId =
  "01234567-89ab-cdef-0123-456789abcdef~aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as EntityId;
const mentionToken: Extract<TextToken, { tokenType: "mention" }> = {
  tokenType: "mention",
  mentionType: "user",
  entityId: mentionEntityId,
};
const textualContent: TextToken[] = [
  {
    tokenType: "text",
    text: "Please <script>alert('unsafe')</script> ask ",
  },
  mentionToken,
];

describe("deliverMentionNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPermissionsOnEntity.mockResolvedValue({ view: true });
    mocks.getMentionNotification.mockResolvedValue(null);
    mocks.getWebShortname.mockResolvedValue("workspace");
  });

  it("deduplicates recipients and retries email delivery", async () => {
    const sendMail = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(undefined);
    const recipient = user({
      accountId: "recipient-account",
      entityId: mentionEntityId,
    });

    await deliverMentionNotifications({
      authentication,
      context: {
        emailTransporter: { sendMail },
      } as unknown as ImpureGraphContext,
      mentionedUsers: [recipient, recipient],
      target: { occurredInEntity: { entity: targetEntity } },
      textualContent,
      triggeredByUser: user({
        accountId: "author-account",
        entityId:
          "01234567-89ab-cdef-0123-456789abcdef~bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as EntityId,
      }),
    });

    expect(mocks.createMentionNotification).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(sendMail.mock.calls[2]?.[0].html).toContain(
      "/supply-chain/site/site-1?opportunity=site-1%3A%3Aqa_hold%3A%3Anode-1",
    );
    expect(sendMail.mock.calls[2]?.[0].html).not.toContain("<script>");
  });

  it("skips self mentions and recipients without view permission", async () => {
    const sendMail = vi.fn();
    const author = user({
      accountId: "author-account",
      entityId:
        "01234567-89ab-cdef-0123-456789abcdef~bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as EntityId,
    });
    const recipient = user({
      accountId: "recipient-account",
      entityId: mentionEntityId,
    });
    mocks.checkPermissionsOnEntity.mockResolvedValue({ view: false });

    await deliverMentionNotifications({
      authentication,
      context: {
        emailTransporter: { sendMail },
      } as unknown as ImpureGraphContext,
      mentionedUsers: [author, recipient],
      target: { occurredInEntity: { entity: targetEntity } },
      textualContent,
      triggeredByUser: author,
    });

    expect(mocks.createMentionNotification).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("dispatches page mentions to the owning workspace and page", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const recipient = user({
      accountId: "recipient-account",
      entityId: mentionEntityId,
    });
    const page = {
      ...targetEntity,
      metadata: {
        ...targetEntity.metadata,
        entityTypeIds: [systemEntityTypes.document.entityTypeId],
      },
      properties: {},
    } as unknown as HashEntity;

    await deliverMentionNotifications({
      authentication,
      context: {
        emailTransporter: { sendMail },
      } as unknown as ImpureGraphContext,
      mentionedUsers: [recipient],
      target: { occurredInEntity: { entity: page } },
      textualContent,
      triggeredByUser: user({
        accountId: "author-account",
        entityId:
          "01234567-89ab-cdef-0123-456789abcdef~bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as EntityId,
      }),
    });

    expect(sendMail.mock.calls[0]?.[0].html).toContain(
      "/@workspace/12345678-90ab-cdef-1234-567890abcdef",
    );
  });

  it("logs exhausted email failures without rejecting the hook", async () => {
    const logger = { error: vi.fn() };
    const recipient = user({
      accountId: "recipient-account",
      entityId: mentionEntityId,
    });

    await expect(
      deliverMentionNotifications({
        authentication,
        context: {
          emailTransporter: {
            sendMail: vi.fn().mockRejectedValue(new Error("unavailable")),
          },
          logger,
        } as unknown as ImpureGraphContext,
        mentionedUsers: [recipient],
        target: { occurredInEntity: { entity: targetEntity } },
        textualContent,
        triggeredByUser: user({
          accountId: "author-account",
          entityId:
            "01234567-89ab-cdef-0123-456789abcdef~bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" as EntityId,
        }),
      }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
