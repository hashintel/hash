import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ImpureGraphContext } from "@apps/hash-api/src/graph/context-types";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { createEntity } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { createBlock } from "@apps/hash-api/src/graph/knowledge/system-types/block";
import { createComment } from "@apps/hash-api/src/graph/knowledge/system-types/comment";
import { getCommentNotification } from "@apps/hash-api/src/graph/knowledge/system-types/notification";
import { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org.js";
import {
  createPage,
  getPageBlocks,
} from "@apps/hash-api/src/graph/knowledge/system-types/page";
import {
  joinOrg,
  User,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { TextProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractOwnedByIdFromEntityId, OwnedById } from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
  waitForAfterHookTriggerToComplete,
} from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

describe("Comment Notification", () => {
  let triggerUser: User;
  let recipientUser: User;

  let testOrg: Org;

  beforeAll(async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    await TypeSystemInitializer.initialize();

    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    triggerUser = await createTestUser(graphContext, "notifTrigger", logger);

    recipientUser = await createTestUser(
      graphContext,
      "notifRecipient",
      logger,
    );

    testOrg = await createTestOrg(
      graphContext,
      { actorId: triggerUser.accountId },
      "notif",
      logger,
    );

    await joinOrg(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        userEntityId: recipientUser.entity.metadata.recordId.entityId,
        orgEntityId: testOrg.entity.metadata.recordId.entityId,
      },
    );
  });

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: triggerUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: recipientUser.kratosIdentityId,
    });

    await resetGraph();
  });

  it("can create a comment notification when a comment is left on a page", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const initialBlock = await createBlock(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        ownedById: testOrg.accountGroupId as OwnedById,
        componentId: "text",
        blockData: await createEntity(
          graphContext,
          { actorId: recipientUser.accountId },
          {
            ownedById: testOrg.accountGroupId as OwnedById,
            entityTypeId: systemEntityTypes.text.entityTypeId,
            properties: {
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
                [],
            } as TextProperties,
          },
        ),
      },
    );

    const occurredInEntity = await createPage(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        initialBlocks: [initialBlock],
        title: "Test Page",
        ownedById: testOrg.accountGroupId as OwnedById,
        type: "document",
      },
    );

    const blocks = await getPageBlocks(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        pageEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        type: "document",
      },
    );

    const occurredInBlock = blocks[0]!.rightEntity;

    const comment = await createComment(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        ownedById: extractOwnedByIdFromEntityId(
          occurredInEntity.entity.metadata.recordId.entityId,
        ),
        author: triggerUser,
        parentEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        textualContent: [],
      },
    );

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await waitForAfterHookTriggerToComplete();

    const commentNotification = await getCommentNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        triggeredByComment: comment,
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
      },
    );

    expect(commentNotification).not.toBeNull();
  });

  it("can create a comment notification when a user replies to an existing comment", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const initialBlock = await createBlock(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        ownedById: testOrg.accountGroupId as OwnedById,
        componentId: "text",
        blockData: await createEntity(
          graphContext,
          { actorId: triggerUser.accountId },
          {
            ownedById: testOrg.accountGroupId as OwnedById,
            entityTypeId: systemEntityTypes.text.entityTypeId,
            properties: {
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
                [],
            } as TextProperties,
          },
        ),
      },
    );

    const occurredInEntity = await createPage(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        initialBlocks: [initialBlock],
        title: "Test Page",
        ownedById: testOrg.accountGroupId as OwnedById,
        type: "document",
      },
    );

    const blocks = await getPageBlocks(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        pageEntityId: occurredInEntity.entity.metadata.recordId.entityId,
        type: "document",
      },
    );

    const occurredInBlock = blocks[0]!.rightEntity;

    const comment = await createComment(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        ownedById: extractOwnedByIdFromEntityId(
          occurredInEntity.entity.metadata.recordId.entityId,
        ),
        author: recipientUser,
        parentEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        textualContent: [],
      },
    );

    const commentReply = await createComment(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        ownedById: extractOwnedByIdFromEntityId(
          occurredInEntity.entity.metadata.recordId.entityId,
        ),
        author: triggerUser,
        parentEntityId: comment.entity.metadata.recordId.entityId,
        textualContent: [],
      },
    );

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await waitForAfterHookTriggerToComplete();

    const commentReplyNotification = await getCommentNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        triggeredByComment: commentReply,
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        repliedToComment: comment,
        includeDrafts: false,
      },
    );

    expect(commentReplyNotification).not.toBeNull();
  });
});
