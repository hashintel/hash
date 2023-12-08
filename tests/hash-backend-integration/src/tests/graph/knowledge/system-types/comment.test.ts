import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ImpureGraphContext } from "@apps/hash-api/src/graph/context-types";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { createEntity } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import {
  Block,
  createBlock,
} from "@apps/hash-api/src/graph/knowledge/system-types/block";
import {
  createComment,
  getCommentAuthor,
  getCommentParent,
  getCommentText,
} from "@apps/hash-api/src/graph/knowledge/system-types/comment";
import {
  createPage,
  getPageBlocks,
  Page,
} from "@apps/hash-api/src/graph/knowledge/system-types/page";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { TextProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { OwnedById } from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestUser,
  waitForAfterHookTriggerToComplete,
} from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

describe("Comment", () => {
  let testUser: User;
  let testBlock: Block;
  let testPage: Page;

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "commentTest", logger);
    const authentication = { actorId: testUser.accountId };

    const initialBlock = await createBlock(
      graphContext,
      { actorId: testUser.accountId },
      {
        ownedById: testUser.accountId as OwnedById,
        componentId: "text",
        blockData: await createEntity(
          graphContext,
          { actorId: testUser.accountId },
          {
            ownedById: testUser.accountId as OwnedById,
            entityTypeId: systemEntityTypes.text.entityTypeId,
            properties: {
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
                [],
            } as TextProperties,
          },
        ),
      },
    );

    testPage = await createPage(graphContext, authentication, {
      initialBlocks: [initialBlock],
      ownedById: testUser.accountId as OwnedById,
      title: "test page",
      type: "document",
    });

    const pageBlocks = await getPageBlocks(graphContext, authentication, {
      pageEntityId: testPage.entity.metadata.recordId.entityId,
      type: "document",
    });

    testBlock = pageBlocks[0]!.rightEntity;
  });

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });

    await resetGraph();
  });

  it("createComment method can create a comment", async () => {
    const authentication = { actorId: testUser.accountId };

    const comment = await createComment(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      parentEntityId: testBlock.entity.metadata.recordId.entityId,
      textualContent: [],
      author: testUser,
    });

    /**
     * Notifications are created after the request is resolved, so we need to wait
     * before trying to get the notification.
     *
     * @todo: consider adding retry logic instead of relying on a timeout
     */
    await waitForAfterHookTriggerToComplete();

    const commentEntityId = comment.entity.metadata.recordId.entityId;

    const hasText = await getCommentText(graphContext, authentication, {
      commentEntityId,
    });
    expect(hasText.textualContent).toEqual([]);

    const commentAuthor = await getCommentAuthor(graphContext, authentication, {
      commentEntityId,
    });
    expect(commentAuthor.entity).toEqual(testUser.entity);

    const parentBlock = await getCommentParent(graphContext, authentication, {
      commentEntityId,
    });
    expect(parentBlock).toEqual(testBlock.entity);
  });
});
