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
import { SYSTEM_TYPES } from "@apps/hash-api/src/graph/system-types";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { OwnedById } from "@local/hash-subgraph";

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

    const textEntity = await createEntity(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      properties: {
        [SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUri]: [],
      },
      entityTypeId: SYSTEM_TYPES.entityType.text.schema.$id,
      actorId: testUser.accountId,
    });

    testBlock = await createBlock(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      componentId: testBlockComponentId,
      blockData: textEntity,
      actorId: testUser.accountId,
    });
  });

  it("createComment method can create a comment", async () => {
    const comment = await createComment(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      parent: testBlock.entity,
      tokens: [],
      author: testUser,
      actorId: testUser.accountId,
    });

    const hasText = await getCommentText(graphContext, { comment });
    expect(
      hasText.properties[
        SYSTEM_TYPES.propertyType.tokens.metadata.recordId.baseUri
      ],
    ).toEqual([]);

    const commentAuthor = await getCommentAuthor(graphContext, { comment });
    expect(commentAuthor.entity).toEqual(testUser.entity);

    const parentBlock = await getCommentParent(graphContext, { comment });
    expect(parentBlock).toEqual(testBlock.entity);
  });
});
