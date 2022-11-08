import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import { ensureSystemTypesExist } from "@hashintel/hash-api/src/graph/system-types";
import {
  BlockModel,
  EntityModel,
  EntityTypeModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import { generateSystemEntityTypeSchema } from "@hashintel/hash-api/src/model/util";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { generateTypeId } from "@hashintel/hash-shared/types";
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

describe("Block model class", () => {
  let testUser: UserModel;

  let testBlock: BlockModel;

  const testBlockComponentId = "test-component-id";

  let testBlockDataEntity: EntityModel;

  let dummyEntityType: EntityTypeModel;

  beforeAll(async () => {
    await ensureSystemTypesExist({ graphApi, logger });

    testUser = await createTestUser(graphApi, "blockModelTest", logger);

    /**
     * @todo: rename to something more representative of a real-world use-case,
     * once the exact role of the block data entity's entity type is known.
     */
    dummyEntityType = await EntityTypeModel.create(graphApi, {
      ownedById: testUser.entityId,
      schema: generateSystemEntityTypeSchema({
        entityTypeId: generateTypeId({
          namespace: testUser.getShortname()!,
          kind: "entity-type",
          title: "Dummy",
        }),
        title: "Dummy",
        properties: [],
        outgoingLinks: [],
        actorId: testUser.entityId,
      }),
      actorId: testUser.entityId,
    });

    testBlockDataEntity = await EntityModel.create(graphApi, {
      ownedById: testUser.entityId,
      properties: {},
      entityTypeModel: dummyEntityType,
      actorId: testUser.entityId,
    });
  });

  it("can create a Block", async () => {
    testBlock = await BlockModel.createBlock(graphApi, {
      ownedById: testUser.entityId,
      componentId: testBlockComponentId,
      blockData: testBlockDataEntity,
      actorId: testUser.entityId,
    });
  });

  it("can get a block by its entity id", async () => {
    const fetchedBlock = await BlockModel.getBlockById(graphApi, {
      entityId: testBlock.entityId,
    });

    expect(fetchedBlock).not.toBeNull();

    expect(fetchedBlock).toEqual(testBlock);
  });

  it("can get the block's data entity", async () => {
    const fetchedBlockData = await testBlock.getBlockData(graphApi);

    expect(fetchedBlockData).toEqual(testBlockDataEntity);
  });

  it("can update the block data entity", async () => {
    const newBlockDataEntity = await EntityModel.create(graphApi, {
      ownedById: testUser.entityId,
      properties: {},
      entityTypeModel: dummyEntityType,
      actorId: testUser.entityId,
    });

    expect(testBlockDataEntity).not.toEqual(newBlockDataEntity);
    expect(await testBlock.getBlockData(graphApi)).toEqual(testBlockDataEntity);

    await testBlock.updateBlockDataEntity(graphApi, {
      newBlockDataEntity,
      actorId: testUser.entityId,
    });

    expect(await testBlock.getBlockData(graphApi)).toEqual(newBlockDataEntity);
  });

  it("cannot update the block data entity to the same data entity", async () => {
    const currentDataEntity = await testBlock.getBlockData(graphApi);

    await expect(
      testBlock.updateBlockDataEntity(graphApi, {
        newBlockDataEntity: currentDataEntity,
        actorId: testUser.entityId,
      }),
    ).rejects.toThrow(/already has a linked block data entity with entity id/);
  });
});
