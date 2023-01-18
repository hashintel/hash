import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { createEntity } from "@hashintel/hash-api/src/graph/knowledge/primitive/entity";
import {
  Block,
  createBlock,
  getBlockById,
  getBlockData,
  updateBlockDataEntity,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/block";
import { User } from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { createEntityType } from "@hashintel/hash-api/src/graph/ontology/primitive/entity-type";
import { generateSystemEntityTypeSchema } from "@hashintel/hash-api/src/graph/util";
import { Entity, EntityTypeWithMetadata } from "@hashintel/hash-subgraph";
import { Logger } from "@local/hash-backend-utils/logger";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { OwnedById } from "@local/hash-isomorphic-utils/types";

import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

describe("Block", () => {
  let testUser: User;

  let testBlock: Block;

  const testBlockComponentId = "test-component-id";

  let testBlockDataEntity: Entity;

  let dummyEntityType: EntityTypeWithMetadata;

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "blockTest", logger);

    /**
     * @todo: rename to something more representative of a real-world use-case,
     * once the exact role of the block data entity's entity type is known.
     */
    dummyEntityType = await createEntityType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: generateSystemEntityTypeSchema({
        entityTypeId: generateTypeId({
          namespace: testUser.shortname!,
          kind: "entity-type",
          title: "Dummy",
        }),
        title: "Dummy",
        properties: [],
        outgoingLinks: [],
      }),
      actorId: testUser.accountId,
    });

    testBlockDataEntity = await createEntity(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      properties: {},
      entityTypeId: dummyEntityType.schema.$id,
      actorId: testUser.accountId,
    });
  });

  it("can create a Block", async () => {
    testBlock = await createBlock(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      componentId: testBlockComponentId,
      blockData: testBlockDataEntity,
      actorId: testUser.accountId,
    });
  });

  it("can get a block by its entity id", async () => {
    const fetchedBlock = await getBlockById(graphContext, {
      entityId: testBlock.entity.metadata.editionId.baseId,
    });

    expect(fetchedBlock).not.toBeNull();

    expect(fetchedBlock.entity).toEqual(testBlock.entity);
  });

  it("can get the block's data entity", async () => {
    const fetchedBlockData = await getBlockData(graphContext, {
      block: testBlock,
    });

    expect(fetchedBlockData).toEqual(testBlockDataEntity);
  });

  it("can update the block data entity", async () => {
    const newBlockDataEntity = await createEntity(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      properties: {},
      entityTypeId: dummyEntityType.schema.$id,
      actorId: testUser.accountId,
    });

    expect(testBlockDataEntity).not.toEqual(newBlockDataEntity);
    expect(await getBlockData(graphContext, { block: testBlock })).toEqual(
      testBlockDataEntity,
    );

    await updateBlockDataEntity(graphContext, {
      block: testBlock,
      newBlockDataEntity,
      actorId: testUser.accountId,
    });

    expect(await getBlockData(graphContext, { block: testBlock })).toEqual(
      newBlockDataEntity,
    );
  });

  it("cannot update the block data entity to the same data entity", async () => {
    const currentDataEntity = await getBlockData(graphContext, {
      block: testBlock,
    });

    await expect(
      updateBlockDataEntity(graphContext, {
        block: testBlock,
        newBlockDataEntity: currentDataEntity,
        actorId: testUser.accountId,
      }),
    ).rejects.toThrow(/already has a linked block data entity with entity id/);
  });
});
