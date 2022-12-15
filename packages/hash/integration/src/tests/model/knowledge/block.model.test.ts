import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
} from "@hashintel/hash-api/src/graph";
import {
  BlockModel,
  EntityModel,
  UserModel,
} from "@hashintel/hash-api/src/model";
import { generateSystemEntityTypeSchema } from "@hashintel/hash-api/src/model/util";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { generateTypeId } from "@hashintel/hash-shared/ontology-types";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { EntityTypeWithMetadata } from "@hashintel/hash-subgraph";
import { brand } from "@hashintel/hash-shared/types";

import { createEntityType } from "@hashintel/hash-api/src/graph/ontology/primitive/entity-type";
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

  let dummyEntityType: EntityTypeWithMetadata;

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ graphApi, logger });

    testUser = await createTestUser(graphApi, "blockModelTest", logger);

    /**
     * @todo: rename to something more representative of a real-world use-case,
     * once the exact role of the block data entity's entity type is known.
     */
    dummyEntityType = await createEntityType(
      { graphApi },
      {
        ownedById: brand(testUser.getEntityUuid()),
        schema: generateSystemEntityTypeSchema({
          entityTypeId: generateTypeId({
            namespace: testUser.getShortname()!,
            kind: "entity-type",
            title: "Dummy",
          }),
          title: "Dummy",
          properties: [],
          outgoingLinks: [],
        }),
        actorId: brand(testUser.getEntityUuid()),
      },
    );

    testBlockDataEntity = await EntityModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      properties: {},
      entityType: dummyEntityType,
      actorId: testUser.getEntityUuid(),
    });
  });

  it("can create a Block", async () => {
    testBlock = await BlockModel.createBlock(graphApi, {
      ownedById: testUser.getEntityUuid(),
      componentId: testBlockComponentId,
      blockData: testBlockDataEntity,
      actorId: testUser.getEntityUuid(),
    });
  });

  it("can get a block by its entity id", async () => {
    const fetchedBlock = await BlockModel.getBlockById(graphApi, {
      entityId: testBlock.getBaseId(),
    });

    expect(fetchedBlock).not.toBeNull();

    expect(fetchedBlock.entity).toEqual(testBlock.entity);
  });

  it("can get the block's data entity", async () => {
    const fetchedBlockData = await testBlock.getBlockData(graphApi);

    expect(fetchedBlockData.entity).toEqual(testBlockDataEntity.entity);
  });

  it("can update the block data entity", async () => {
    const newBlockDataEntity = await EntityModel.create(graphApi, {
      ownedById: testUser.getEntityUuid(),
      properties: {},
      entityType: dummyEntityType,
      actorId: testUser.getEntityUuid(),
    });

    expect(testBlockDataEntity).not.toEqual(newBlockDataEntity);
    expect((await testBlock.getBlockData(graphApi)).entity).toEqual(
      testBlockDataEntity.entity,
    );

    await testBlock.updateBlockDataEntity(graphApi, {
      newBlockDataEntity,
      actorId: testUser.getEntityUuid(),
    });

    expect((await testBlock.getBlockData(graphApi)).entity).toEqual(
      newBlockDataEntity.entity,
    );
  });

  it("cannot update the block data entity to the same data entity", async () => {
    const currentDataEntity = await testBlock.getBlockData(graphApi);

    await expect(
      testBlock.updateBlockDataEntity(graphApi, {
        newBlockDataEntity: currentDataEntity,
        actorId: testUser.getEntityUuid(),
      }),
    ).rejects.toThrow(/already has a linked block data entity with entity id/);
  });
});
