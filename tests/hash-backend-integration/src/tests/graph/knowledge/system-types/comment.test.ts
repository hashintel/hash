import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { Block } from "@apps/hash-api/src/graph/knowledge/system-types/block";
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
import { systemUser } from "@apps/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { OwnedById } from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

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

    testPage = await createPage(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      title: "test page",
    });

    const pageBlocks = await getPageBlocks(graphContext, authentication, {
      pageEntityId: testPage.entity.metadata.recordId.entityId,
    });

    testBlock = pageBlocks[0]!.rightEntity;
  });

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: systemUser.kratosIdentityId,
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
