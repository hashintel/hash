import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import {
  getEntityOutgoingLinks,
  updateEntity,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import type { Block } from "@apps/hash-api/src/graph/knowledge/system-types/block";
import { getBlockData } from "@apps/hash-api/src/graph/knowledge/system-types/block";
import type { Comment } from "@apps/hash-api/src/graph/knowledge/system-types/comment";
import {
  createComment,
  getCommentText,
} from "@apps/hash-api/src/graph/knowledge/system-types/comment";
import type { MentionNotification } from "@apps/hash-api/src/graph/knowledge/system-types/notification";
import {
  archiveNotification,
  createMentionNotification,
  getMentionNotification,
} from "@apps/hash-api/src/graph/knowledge/system-types/notification";
import type { Page } from "@apps/hash-api/src/graph/knowledge/system-types/page";
import {
  createPage,
  getPageBlocks,
} from "@apps/hash-api/src/graph/knowledge/system-types/page";
import type { Text } from "@apps/hash-api/src/graph/knowledge/system-types/text";
import { getTextFromEntity } from "@apps/hash-api/src/graph/knowledge/system-types/text";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { Logger } from "@local/hash-backend-utils/logger";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { TextualContentPropertyValueWithMetadata } from "@local/hash-isomorphic-utils/system-types/shared";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestUser,
  waitForAfterHookTriggerToComplete,
} from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

// TODO: Create machine user to create notifications
//   see https://linear.app/hash/issue/H-1433
// TODO: Figure out what to do if someone tries to create a Link for entities they don't see
//   see https://linear.app/hash/issue/H-1434
describe.skip("Page Mention Notification", () => {
  let triggerUser: User;
  let recipientUser: User;

  beforeAll(async () => {
    const graphContext = createTestImpureGraphContext();

    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    triggerUser = await createTestUser(graphContext, "notifTrigger", logger);

    recipientUser = await createTestUser(
      graphContext,
      "notifRecipient",
      logger,
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

  let pageMentionNotification: MentionNotification;

  let occurredInEntity: Page;

  let occurredInBlock: Block;

  let occurredInText: Text;

  it("can create a page mention notification", async () => {
    const graphContext = createTestImpureGraphContext();
    const authentication = { actorId: triggerUser.accountId };

    occurredInEntity = await createPage(graphContext, authentication, {
      title: "Test Page",
      ownedById: triggerUser.accountId as OwnedById,
      type: "document",
    });

    const pageBlocks = await getPageBlocks(graphContext, authentication, {
      pageEntityId: occurredInEntity.entity.metadata.recordId.entityId,
      type: "document",
    }).then((blocksWithLinks) =>
      blocksWithLinks.map(({ rightEntity }) => rightEntity),
    );

    occurredInBlock = pageBlocks[0]!;

    const textEntity = await getBlockData(graphContext, authentication, {
      block: occurredInBlock,
    });

    expect(textEntity.metadata.entityTypeId).toBe(
      systemEntityTypes.text.entityTypeId,
    );

    occurredInText = getTextFromEntity({ entity: textEntity });

    pageMentionNotification = await createMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInText,
        occurredInBlock,
        ownedById: recipientUser.accountId as OwnedById,
      },
    );

    expect(pageMentionNotification.archived).toBeUndefined();

    const outgoingLinks = await getEntityOutgoingLinks(
      graphContext,
      { actorId: recipientUser.accountId },
      { entityId: pageMentionNotification.entity.metadata.recordId.entityId },
    );

    const occurredInEntityLinks = outgoingLinks.filter(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
    );

    expect(occurredInEntityLinks).toHaveLength(1);

    const [occurredInEntityLink] = occurredInEntityLinks;

    expect(occurredInEntityLink!.linkData.rightEntityId).toBe(
      occurredInEntity.entity.metadata.recordId.entityId,
    );

    const occurredInTextLinks = outgoingLinks.filter(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.occurredInText.linkEntityTypeId,
    );

    expect(occurredInTextLinks).toHaveLength(1);

    const [occurredInTextLink] = occurredInTextLinks;

    expect(occurredInTextLink!.linkData.rightEntityId).toBe(
      occurredInText.entity.metadata.recordId.entityId,
    );

    const triggeredByUserLinks = outgoingLinks.filter(
      ({ metadata }) =>
        metadata.entityTypeId ===
        systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
    );

    expect(triggeredByUserLinks).toHaveLength(1);

    const [triggeredByUserLink] = triggeredByUserLinks;

    expect(triggeredByUserLink!.linkData.rightEntityId).toBe(
      triggerUser.entity.metadata.recordId.entityId,
    );
  });

  it("can get a mention notification by its triggered user, recipient user, page and text", async () => {
    const graphContext = createTestImpureGraphContext();
    const authentication = { actorId: recipientUser.accountId };

    const fetchedPageMentionNotification = (await getMentionNotification(
      graphContext,
      authentication,
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInText,
      },
    ))!;

    expect(fetchedPageMentionNotification).toBeDefined();

    expect(
      fetchedPageMentionNotification.entity.metadata.recordId.entityId,
    ).toBe(pageMentionNotification.entity.metadata.recordId.entityId);
  });

  it("can archive a notification", async () => {
    const graphContext = createTestImpureGraphContext();
    const authentication = { actorId: recipientUser.accountId };

    await archiveNotification(graphContext, authentication, {
      notification: pageMentionNotification,
    });

    const fetchedPageMentionNotification = await getMentionNotification(
      graphContext,
      authentication,
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(fetchedPageMentionNotification).toBeNull();
  });

  it("can create a page mention notification when a user is mentioned in a page via an update to a text entity", async () => {
    const graphContext = createTestImpureGraphContext();

    const beforePageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(beforePageMentionNotification).toBeNull();

    const updatedTextualContent: TextToken[] = [
      {
        mentionType: "user",
        entityId: recipientUser.entity.metadata.recordId.entityId,
        tokenType: "mention",
      },
    ];

    occurredInText.textualContent = updatedTextualContent;
    occurredInText.entity = await updateEntity(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        entity: occurredInText.entity,
        propertyPatches: [
          {
            op: "replace",
            path: [
              blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl,
            ],
            property: {
              value: updatedTextualContent.map((token) => ({
                value: token,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                },
              })),
            } satisfies TextualContentPropertyValueWithMetadata,
          },
        ],
      },
    );

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await waitForAfterHookTriggerToComplete();

    const afterPageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(afterPageMentionNotification).not.toBeNull();
  });

  it("can archive a page mention notification when a user mention is removed from a page", async () => {
    const graphContext = createTestImpureGraphContext();

    const beforePageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(beforePageMentionNotification).not.toBeNull();

    const updatedTextualContent: TextToken[] = [];

    occurredInText.textualContent = updatedTextualContent;
    occurredInText.entity = await updateEntity(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        entity: occurredInText.entity,
        propertyPatches: [
          {
            op: "replace",
            path: [
              blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl,
            ],
            property: {
              value: updatedTextualContent.map((token) => ({
                value: token,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                },
              })),
            } satisfies TextualContentPropertyValueWithMetadata,
          },
        ],
      },
    );

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await waitForAfterHookTriggerToComplete();

    const afterPageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(afterPageMentionNotification).toBeNull();
  });

  let occurredInComment: Comment;

  let commentText: Text;

  it("can create a comment mention notification when a user is mentioned in a comment", async () => {
    const graphContext = createTestImpureGraphContext();

    occurredInComment = await createComment(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        parentEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        ownedById: triggerUser.accountId as OwnedById,
        textualContent: [
          {
            mentionType: "user",
            entityId: recipientUser.entity.metadata.recordId.entityId,
            tokenType: "mention",
          },
        ],
        author: triggerUser,
      },
    );

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await waitForAfterHookTriggerToComplete();

    commentText = await getCommentText(
      graphContext,
      { actorId: triggerUser.accountId },
      { commentEntityId: occurredInComment.entity.metadata.recordId.entityId },
    );

    const afterCommentMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInComment,
        occurredInText: commentText,
      },
    );

    expect(afterCommentMentionNotification).not.toBeNull();
  });

  it("can archive a comment mention notification when a user mention is removed from a comment", async () => {
    const graphContext = createTestImpureGraphContext();

    const beforeCommentMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInComment,
        occurredInText: commentText,
      },
    );

    expect(beforeCommentMentionNotification).not.toBeNull();

    const updatedCommentTextualContent: TextToken[] = [];

    commentText.entity = await updateEntity(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        entity: commentText.entity,
        propertyPatches: [
          {
            op: "replace",
            path: [
              blockProtocolPropertyTypes.textualContent.propertyTypeBaseUrl,
            ],
            property: {
              value: updatedCommentTextualContent.map((token) => ({
                value: token,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                },
              })),
            } satisfies TextualContentPropertyValueWithMetadata,
          },
        ],
      },
    );
    commentText.textualContent = updatedCommentTextualContent;

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await waitForAfterHookTriggerToComplete();

    const afterCommentMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity,
        occurredInBlock,
        occurredInComment,
        occurredInText: commentText,
      },
    );

    expect(afterCommentMentionNotification).toBeNull();
  });
});
