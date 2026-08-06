import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import {
  createEntity,
  getEntityOutgoingLinks,
  getLatestEntityById,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import {
  archiveNotification,
  getMentionNotification,
  getNotificationFromEntity,
  markNotificationAsRead,
} from "@apps/hash-api/src/graph/knowledge/system-types/notification";
import { joinOrg } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  blockProtocolDataTypes,
  blockProtocolPropertyTypes,
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
  waitForAfterHookTriggerToComplete,
} from "../../../util";

import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import type { PropertyObjectWithMetadata } from "@blockprotocol/type-system";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

describe("Opportunity status mention notification", () => {
  let author: User;
  let recipient: User;
  let org: Org;

  beforeAll(async () => {
    const graphContext = createTestImpureGraphContext();
    await ensureSystemGraphIsInitialized({
      context: graphContext,
      logger,
      seedSystemPolicies: true,
    });
    author = await createTestUser(graphContext, "statusauthor", logger);
    recipient = await createTestUser(graphContext, "statusrecipient", logger);
    org = await createTestOrg(
      {
        ...graphContext,
        provenance: { ...graphContext.provenance, actorType: "user" },
      },
      { actorId: author.accountId },
      "statusmentions",
    );
    await joinOrg(
      graphContext,
      { actorId: author.accountId },
      {
        orgEntityId: org.entity.metadata.recordId.entityId,
        userEntityId: recipient.entity.metadata.recordId.entityId,
      },
    );
  });

  afterAll(async () => {
    await deleteKratosIdentity({ kratosIdentityId: author.kratosIdentityId });
    await deleteKratosIdentity({
      kratosIdentityId: recipient.kratosIdentityId,
    });
  });

  it("creates links and supports machine-mediated read and archive", async () => {
    const graphContext = { ...createTestImpureGraphContext(), logger };
    const authentication = { actorId: author.accountId };
    const textualContent: TextToken[] = [
      { tokenType: "text", text: "Please ask " },
      {
        entityId: recipient.entity.metadata.recordId.entityId,
        mentionType: "user",
        tokenType: "mention",
      },
    ];
    const text = (value: string) => ({
      metadata: { dataTypeId: blockProtocolDataTypes.text.dataTypeId },
      value,
    });
    const status = await createEntity(graphContext, authentication, {
      entityTypeIds: [systemEntityTypes.opportunityStatusUpdate.entityTypeId],
      properties: {
        value: {
          [systemPropertyTypes.scopeKey.propertyTypeBaseUrl]: text(
            "site-1::planning::node-1",
          ),
          [systemPropertyTypes.siteCode.propertyTypeBaseUrl]: text("site-1"),
          [systemPropertyTypes.opportunityStatus.propertyTypeBaseUrl]: {
            metadata: {
              dataTypeId: systemDataTypes.opportunityStatusCategory.dataTypeId,
            },
            value: "Investigation started",
          },
          [blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl]: {
            value: textualContent.map((token) => ({
              metadata: {
                dataTypeId: blockProtocolDataTypes.object.dataTypeId,
              },
              value: token,
            })),
          },
        },
      } satisfies PropertyObjectWithMetadata,
      webId: org.webId,
    });

    await waitForAfterHookTriggerToComplete();

    const getNotification = () =>
      getMentionNotification(
        graphContext,
        { actorId: recipient.accountId },
        {
          occurredInEntity: { entity: status },
          recipient,
          triggeredByUser: author,
        },
      );
    await expect.poll(getNotification, { timeout: 15_000 }).not.toBeNull();
    const notification = await getNotification();
    expect(notification).not.toBeNull();

    const outgoingLinks = await getEntityOutgoingLinks(
      graphContext,
      { actorId: recipient.accountId },
      {
        entityId: notification!.entity.metadata.recordId.entityId,
      },
    );
    expect(
      outgoingLinks.some(
        (link) =>
          link.metadata.entityTypeIds.includes(
            systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
          ) &&
          link.linkData.rightEntityId === status.metadata.recordId.entityId,
      ),
    ).toBe(true);

    await markNotificationAsRead(
      graphContext,
      { actorId: recipient.accountId },
      {
        notification: notification!,
        readAt: "2026-08-06T12:00:00.000Z",
      },
    );
    const updatedNotificationEntity = await getLatestEntityById(
      graphContext,
      { actorId: recipient.accountId },
      {
        entityId: notification!.entity.metadata.recordId.entityId,
      },
    );
    expect(
      getNotificationFromEntity({ entity: updatedNotificationEntity }).readAt,
    ).toBe("2026-08-06T12:00:00.000Z");

    await archiveNotification(
      graphContext,
      { actorId: recipient.accountId },
      { notification: notification! },
    );
    await expect(
      getMentionNotification(
        graphContext,
        { actorId: recipient.accountId },
        {
          occurredInEntity: { entity: status },
          recipient,
          triggeredByUser: author,
        },
      ),
    ).resolves.toBeNull();
  });
});
