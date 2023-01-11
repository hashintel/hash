import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { createEntity } from "@hashintel/hash-api/src/graph/knowledge/primitive/entity";
import {
  Block,
  createBlock,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/block";
import {
  createComment,
  getCommentAuthor,
  getCommentParent,
  getCommentText,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/comment";
import { User } from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "@hashintel/hash-api/src/graph/system-types";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { OwnedById } from "@hashintel/hash-shared/types";

import { createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

const graphApi = createGraphClient(logger, {
  host: graphApiHost,
  port: graphApiPort,
});

const graphContext: ImpureGraphContext = { graphApi };

describe("Comment", () => {
  let testUser: User;
  let testBlock: Block;

  const testBlockComponentId = "test-component-id";

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });

    testUser = await createTestUser(graphApi, "commentTest", logger);

    const textEntity = await createEntity(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      properties: {
        [SYSTEM_TYPES.propertyType.tokens.metadata.editionId.baseId]: [],
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
        SYSTEM_TYPES.propertyType.tokens.metadata.editionId.baseId
      ],
    ).toEqual([]);

    const commentAuthor = await getCommentAuthor(graphContext, { comment });
    expect(commentAuthor.entity).toEqual(testUser.entity);

    const parentBlock = await getCommentParent(graphContext, { comment });
    expect(parentBlock).toEqual(testBlock.entity);
  });
});
