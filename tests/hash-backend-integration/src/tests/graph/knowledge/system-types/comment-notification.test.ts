import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
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
import { systemUser } from "@apps/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { extractOwnedByIdFromEntityId, OwnedById } from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
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
    await deleteKratosIdentity({
      kratosIdentityId: systemUser.kratosIdentityId,
    });

    await resetGraph();
  });

  it("can create a comment notification when a comment is left on a page", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const occurredInPage = await createPage(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        title: "Test Page",
        ownedById: testOrg.accountGroupId as OwnedById,
      },
    );

    const blocks = await getPageBlocks(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        pageEntityId: occurredInPage.entity.metadata.recordId.entityId,
      },
    );

    const firstBlock = blocks[0]!.rightEntity;

    const comment = await createComment(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        ownedById: extractOwnedByIdFromEntityId(
          occurredInPage.entity.metadata.recordId.entityId,
        ),
        author: triggerUser,
        parentEntityId: firstBlock.entity.metadata.recordId.entityId,
        tokens: [],
      },
    );

    const commentNotification = await getCommentNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        triggeredByComment: comment,
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity: occurredInPage,
      },
    );

    expect(commentNotification).not.toBeNull();
  });

  it("can create a comment notification when a user replies to an existing comment", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const occurredInPage = await createPage(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        title: "Test Page",
        ownedById: testOrg.accountGroupId as OwnedById,
      },
    );

    const blocks = await getPageBlocks(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        pageEntityId: occurredInPage.entity.metadata.recordId.entityId,
      },
    );

    const firstBlock = blocks[0]!.rightEntity;

    const comment = await createComment(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        ownedById: extractOwnedByIdFromEntityId(
          occurredInPage.entity.metadata.recordId.entityId,
        ),
        author: recipientUser,
        parentEntityId: firstBlock.entity.metadata.recordId.entityId,
        tokens: [],
      },
    );

    const commentReply = await createComment(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        ownedById: extractOwnedByIdFromEntityId(
          occurredInPage.entity.metadata.recordId.entityId,
        ),
        author: triggerUser,
        parentEntityId: comment.entity.metadata.recordId.entityId,
        tokens: [],
      },
    );

    const commentReplyNotification = await getCommentNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        triggeredByComment: commentReply,
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity: occurredInPage,
        repliedToComment: comment,
      },
    );

    expect(commentReplyNotification).not.toBeNull();
  });
});
