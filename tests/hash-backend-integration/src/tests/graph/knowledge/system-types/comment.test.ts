import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
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
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccounts } from "@apps/hash-api/src/graph/system-accounts";
import { SYSTEM_TYPES } from "@apps/hash-api/src/graph/system-types";
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

  const testBlockComponentId = "test-component-id";

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "commentTest", logger);
    const authentication = { actorId: testUser.accountId };

    const textEntity = await createEntity(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      properties: {
        [SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl]: [],
      },
      entityTypeId: SYSTEM_TYPES.entityType.text.schema.$id,
    });

    testBlock = await createBlock(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      componentId: testBlockComponentId,
      blockData: textEntity,
    });
  });

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: systemAccounts.kratosIdentityId,
    });

    await resetGraph();
  });

  it("createComment method can create a comment", async () => {
    const authentication = { actorId: testUser.accountId };

    const comment = await createComment(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      parentEntityId: testBlock.entity.metadata.recordId.entityId,
      tokens: [],
      author: testUser,
    });

    const commentEntityId = comment.entity.metadata.recordId.entityId;

    const hasText = await getCommentText(graphContext, authentication, {
      commentEntityId,
    });
    expect(
      hasText.properties[
        SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUrl
      ],
    ).toEqual([]);

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
