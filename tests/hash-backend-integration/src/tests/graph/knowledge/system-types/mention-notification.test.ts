import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import {
  getEntityOutgoingLinks,
  updateEntityProperties,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { getBlockData } from "@apps/hash-api/src/graph/knowledge/system-types/block";
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

  let occurredInText: Text;

  it("can create a page mention notification", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();
    const authentication = { actorId: triggerUser.accountId };

    occurredInPage = await createPage(graphContext, authentication, {
      title: "Test Page",
      ownedById: triggerUser.accountId as OwnedById,
    });

    const pageBlockDataEntities = await getPageBlocks(
      graphContext,
      authentication,
      {
        pageEntityId: occurredInPage.entity.metadata.recordId.entityId,
      },
    ).then(
      async (pageBlocks) =>
        await Promise.all(
          pageBlocks.map(({ rightEntity: block }) =>
            getBlockData(graphContext, authentication, { block }),
          ),
        ),
    );

    const textEntity = pageBlockDataEntities.find(
      ({ metadata }) =>
        metadata.entityTypeId === types.entityType.text.entityTypeId,
    );

    if (!textEntity) {
      throw new Error("Text entity not found.");
    }

    occurredInText = getTextFromEntity({ entity: textEntity });

    pageMentionNotification = await createMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        triggeredByUser: triggerUser,
        occurredInEntity: occurredInPage,
        occurredInText,
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
        types.linkEntityType.occurredInEntity.linkEntityTypeId,
    );

    expect(occurredInEntityLinks).toHaveLength(1);

    const [occurredInEntityLink] = occurredInEntityLinks;

    expect(occurredInEntityLink!.linkData.rightEntityId).toBe(
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
        occurredInEntity: occurredInPage,
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
        occurredInEntity: occurredInPage,
        occurredInText,
      },
    );

    expect(fetchedPageMentionNotification).toBeNull();
  });

  it("can create a page mention notification when a user is mentioned in a page", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const beforePageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity: occurredInPage,
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

    const afterPageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity: occurredInPage,
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
        occurredInEntity: occurredInPage,
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

    const afterPageMentionNotification = await getMentionNotification(
      graphContext,
      { actorId: recipientUser.accountId },
      {
        recipient: recipientUser,
        triggeredByUser: triggerUser,
        occurredInEntity: occurredInPage,
        occurredInText,
      },
    );

    expect(afterPageMentionNotification).toBeNull();
  });
});
