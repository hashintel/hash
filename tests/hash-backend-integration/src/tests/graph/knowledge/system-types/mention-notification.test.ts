import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import {
  getEntityOutgoingLinks,
  updateEntityProperties,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import {
  Block,
  getBlockData,
} from "@apps/hash-api/src/graph/knowledge/system-types/block";
import {
  Comment,
  createComment,
  getCommentText,
} from "@apps/hash-api/src/graph/knowledge/system-types/comment";
import {
  archiveNotification,
  createMentionNotification,
  getMentionNotification,
  MentionNotification,
} from "@apps/hash-api/src/graph/knowledge/system-types/notification";
import {
  createPage,
  getPageBlocks,
  Page,
} from "@apps/hash-api/src/graph/knowledge/system-types/page";
import {
  getTextFromEntity,
  Text,
} from "@apps/hash-api/src/graph/knowledge/system-types/text";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "@apps/hash-api/src/graph/system-types";
import { systemUser } from "@apps/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { TextToken } from "@local/hash-graphql-shared/graphql/types";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { TextProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity, OwnedById } from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

describe("Page Mention Notification", () => {
  let triggerUser: User;
  let recipientUser: User;

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

  let pageMentionNotification: MentionNotification;

  let occurredInPage: Page;

  let occurredInBlock: Block;

  let occurredInText: Text;

  it("can create a page mention notification", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();
    const authentication = { actorId: triggerUser.accountId };

    occurredInPage = await createPage(graphContext, authentication, {
      title: "Test Page",
      ownedById: triggerUser.accountId as OwnedById,
    });

    const pageBlocks = await getPageBlocks(graphContext, authentication, {
      pageEntityId: occurredInPage.entity.metadata.recordId.entityId,
    }).then((blocksWithLinks) =>
      blocksWithLinks.map(({ rightEntity }) => rightEntity),
    );

    occurredInBlock = pageBlocks[0]!;

    const textEntity = await getBlockData(graphContext, authentication, {
      block: occurredInBlock,
    });

    expect(textEntity.metadata.entityTypeId).toBe(
      types.entityType.text.entityTypeId,
    );

    occurredInText = getTextFromEntity({ entity: textEntity });

    pageMentionNotification = await createMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        triggeredByUser: triggerUser,
        occurredInPage,
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

    const occurredInPageLinks = outgoingLinks.filter(
      ({ metadata }) =>
        metadata.entityTypeId ===
        types.linkEntityType.occurredInPage.linkEntityTypeId,
    );

    expect(occurredInPageLinks).toHaveLength(1);

    const [occurredInPageLink] = occurredInPageLinks;

    expect(occurredInPageLink!.linkData.rightEntityId).toBe(
      occurredInPage.entity.metadata.recordId.entityId,
    );

    const occurredInTextLinks = outgoingLinks.filter(
      ({ metadata }) =>
        metadata.entityTypeId ===
        types.linkEntityType.occurredInText.linkEntityTypeId,
    );

    expect(occurredInTextLinks).toHaveLength(1);

    const [occurredInTextLink] = occurredInTextLinks;

    expect(occurredInTextLink!.linkData.rightEntityId).toBe(
      occurredInText.entity.metadata.recordId.entityId,
    );

    const triggeredByUserLinks = outgoingLinks.filter(
      ({ metadata }) =>
        metadata.entityTypeId ===
        types.linkEntityType.triggeredByUser.linkEntityTypeId,
    );

    expect(triggeredByUserLinks).toHaveLength(1);

    const [triggeredByUserLink] = triggeredByUserLinks;

    expect(triggeredByUserLink!.linkData.rightEntityId).toBe(
      triggerUser.entity.metadata.recordId.entityId,
    );
  });

  it("can get a mention notification by its triggered user, recipient user, page and text", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();
    const authentication = { actorId: recipientUser.accountId };

    const fetchedPageMentionNotification = await getMentionNotification(
      graphContext,
      authentication,
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInPage,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(fetchedPageMentionNotification).toBeDefined();

    expect(
      fetchedPageMentionNotification!.entity.metadata.recordId.entityId,
    ).toBe(pageMentionNotification.entity.metadata.recordId.entityId);
  });

  it("can archive a notification", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();
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
        occurredInPage,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(fetchedPageMentionNotification).toBeNull();
  });

  it("can create a page mention notification when a user is mentioned in a page via an update to a text entity", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const beforePageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInPage,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(beforePageMentionNotification).toBeNull();

    const updatedTextTokens: TextToken[] = [
      {
        mentionType: "user",
        entityId: recipientUser.entity.metadata.recordId.entityId,
        tokenType: "mention",
      },
    ];

    occurredInText.tokens = updatedTextTokens;
    occurredInText.entity = (await updateEntityProperties(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        entity: occurredInText.entity,
        updatedProperties: [
          {
            propertyTypeBaseUrl:
              SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl,
            value: updatedTextTokens,
          },
        ],
      },
    )) as Entity<TextProperties>;

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    const afterPageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInPage,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(afterPageMentionNotification).not.toBeNull();
  });

  it("can archive a page mention notification when a user mention is removed from a page", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const beforePageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInPage,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(beforePageMentionNotification).not.toBeNull();

    const updatedTextTokens: TextToken[] = [];

    occurredInText.tokens = updatedTextTokens;
    occurredInText.entity = (await updateEntityProperties(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        entity: occurredInText.entity,
        updatedProperties: [
          {
            propertyTypeBaseUrl:
              SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl,
            value: updatedTextTokens,
          },
        ],
      },
    )) as Entity<TextProperties>;

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    const afterPageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInPage,
        occurredInBlock,
        occurredInText,
      },
    );

    expect(afterPageMentionNotification).toBeNull();
  });

  let occurredInComment: Comment;

  let commentText: Text;

  it("can create a comment mention notification when a user is mentioned in a comment", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    occurredInComment = await createComment(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        parentEntityId: occurredInBlock.entity.metadata.recordId.entityId,
        ownedById: triggerUser.accountId as OwnedById,
        tokens: [
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
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

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
        occurredInPage,
        occurredInBlock,
        occurredInComment,
        occurredInText: commentText,
      },
    );

    expect(afterCommentMentionNotification).not.toBeNull();
  });

  it("can archive a comment mention notification when a user mention is removed from a comment", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const beforeCommentMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInPage,
        occurredInBlock,
        occurredInComment,
        occurredInText: commentText,
      },
    );

    expect(beforeCommentMentionNotification).not.toBeNull();

    const updatedCommentTextTokens: TextToken[] = [];

    commentText.entity = (await updateEntityProperties(
      graphContext,
      { actorId: triggerUser.accountId },
      {
        entity: commentText.entity,
        updatedProperties: [
          {
            propertyTypeBaseUrl:
              SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl,
            value: updatedCommentTextTokens,
          },
        ],
      },
    )) as Entity<TextProperties>;
    commentText.tokens = updatedCommentTextTokens;

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });

    const afterCommentMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInPage,
        occurredInBlock,
        occurredInComment,
        occurredInText: commentText,
      },
    );

    expect(afterCommentMentionNotification).toBeNull();
  });
});
