import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import {
  ensureWorkspaceTypesExist,
  WORKSPACE_TYPES,
} from "@hashintel/hash-api/src/graph/workspace-types";
import {
  BlockModel,
  EntityModel,
  UserModel,
  CommentModel,
} from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { createTestUser } from "../../util";

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

describe("Comment model class", () => {
  let testUser: UserModel;
  let testBlock: BlockModel;

  const testBlockComponentId = "test-component-id";

  beforeAll(async () => {
    await ensureWorkspaceTypesExist({ graphApi, logger });

    testUser = await createTestUser(graphApi, "blockModelTest", logger);

    const textEntity = await EntityModel.create(graphApi, {
      ownedById: testUser.ownedById,
      properties: {
        [WORKSPACE_TYPES.propertyType.tokens.baseUri]: [],
      },
      entityTypeModel: WORKSPACE_TYPES.entityType.text,
    });

    testBlock = await BlockModel.createBlock(graphApi, {
      ownedById: testUser.ownedById,
      componentId: testBlockComponentId,
      blockData: textEntity,
    });
  });

  it("createComment method can create a comment", async () => {
    const comment = await CommentModel.createComment(graphApi, {
      ownedById: testUser.ownedById,
      parent: testBlock,
      tokens: [],
      author: testUser,
    });

    const hasText = await comment.getHasText(graphApi);
    expect(
      (hasText.properties as any)[WORKSPACE_TYPES.propertyType.tokens.baseUri],
    ).toEqual([]);

    const commentAuthor = await comment.getAuthor(graphApi);
    expect(commentAuthor).toEqual(testUser);

    const parentBlock = await comment.getParent(graphApi);
    expect(parentBlock).toEqual(testBlock);
  });
});
