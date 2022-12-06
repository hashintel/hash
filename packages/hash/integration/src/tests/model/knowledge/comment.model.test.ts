import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import {
  createGraphClient,
  ensureHashAppIsInitialized,
} from "@hashintel/hash-api/src/graph";
import { SYSTEM_TYPES } from "@hashintel/hash-api/src/graph/system-types";
import {
  BlockModel,
  EntityModel,
  UserModel,
  CommentModel,
} from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
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
    await TypeSystemInitializer.initialize();
    await ensureHashAppIsInitialized({ graphApi, logger });

    testUser = await createTestUser(graphApi, "commentModelTest", logger);

    const textEntity = await EntityModel.create(graphApi, {
      ownedById: testUser.getOwnedById(),
      properties: {
        [SYSTEM_TYPES.propertyType.tokens.getBaseUri()]: [],
      },
      entityTypeModel: SYSTEM_TYPES.entityType.text,
      actorId: testUser.getOwnedById(),
    });

    testBlock = await BlockModel.createBlock(graphApi, {
      ownedById: testUser.getOwnedById(),
      componentId: testBlockComponentId,
      blockData: textEntity,
      actorId: testUser.getOwnedById(),
    });
  });

  it("createComment method can create a comment", async () => {
    const comment = await CommentModel.createComment(graphApi, {
      ownedById: testUser.getOwnedById(),
      parent: testBlock,
      tokens: [],
      author: testUser,
      actorId: testUser.getOwnedById(),
    });

    const hasText = await comment.getHasText(graphApi);
    expect(
      (hasText.getProperties() as any)[
        SYSTEM_TYPES.propertyType.tokens.getBaseUri()
      ],
    ).toEqual([]);

    const commentAuthor = await comment.getAuthor(graphApi);
    expect(commentAuthor.entity).toEqual(testUser.entity);

    const parentBlock = await comment.getParent(graphApi);
    expect(parentBlock.entity).toEqual(testBlock.entity);
  });
});
