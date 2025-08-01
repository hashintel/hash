import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { generateSystemEntityTypeSchema } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized/migrate-ontology-types/util";
import { createEntity } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import type { Block } from "@apps/hash-api/src/graph/knowledge/system-types/block";
import {
  createBlock,
  getBlockById,
  getBlockData,
  updateBlockDataEntity,
} from "@apps/hash-api/src/graph/knowledge/system-types/block";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { createEntityType } from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import type { EntityTypeWithMetadata, WebId } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { generateTypeId } from "@local/hash-isomorphic-utils/ontology-types";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("Block", () => {
  let testUser: User;

  let testBlock: Block;

  const testBlockComponentId = "test-component-id";

  let testBlockDataEntity: HashEntity;

  let dummyEntityType: EntityTypeWithMetadata;

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({
      logger,
      context: graphContext,
      seedSystemPolicies: true,
    });

    testUser = await createTestUser(graphContext, "blockTest", logger);
    const authentication = { actorId: testUser.accountId };

    /**
     * @todo: rename to something more representative of a real-world use-case,
     * once the exact role of the block data entity's entity type is known.
     */
    dummyEntityType = await createEntityType(graphContext, authentication, {
      webId: testUser.accountId as WebId,
      schema: generateSystemEntityTypeSchema({
        entityTypeId: generateTypeId({
          kind: "entity-type",
          title: "Dummy",
          webShortname: testUser.shortname!,
        }),
        title: "Dummy",
        description: "A dummy entity type for testing purposes.",
        properties: [],
        outgoingLinks: [],
      }),
    });

    testBlockDataEntity = await createEntity(graphContext, authentication, {
      webId: testUser.accountId as WebId,
      properties: { value: {} },
      entityTypeIds: [dummyEntityType.schema.$id],
    });

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: testUser.kratosIdentityId,
      });

      await resetGraph();
    };
  });

  it("can create a Block", async () => {
    const authentication = { actorId: testUser.accountId };

    testBlock = await createBlock(graphContext, authentication, {
      webId: testUser.accountId as WebId,
      componentId: testBlockComponentId,
      blockData: testBlockDataEntity,
    });
  });

  it("can get a block by its entity id", async () => {
    const authentication = { actorId: testUser.accountId };

    const fetchedBlock = await getBlockById(graphContext, authentication, {
      entityId: testBlock.entity.metadata.recordId.entityId,
    });

    expect(fetchedBlock).not.toBeNull();

    expect(fetchedBlock.entity).toEqual(testBlock.entity);
  });

  it("can get the block's data entity", async () => {
    const authentication = { actorId: testUser.accountId };

    const fetchedBlockData = await getBlockData(graphContext, authentication, {
      block: testBlock,
    });

    expect(fetchedBlockData).toEqual(testBlockDataEntity);
  });

  it("can update the block data entity", async () => {
    const authentication = { actorId: testUser.accountId };

    const newBlockDataEntity = await createEntity(
      graphContext,
      authentication,
      {
        webId: testUser.accountId as WebId,
        properties: { value: {} },
        entityTypeIds: [dummyEntityType.schema.$id],
      },
    );

    expect(newBlockDataEntity.toJSON()).not.toEqual(
      testBlockDataEntity.toJSON(),
    );
    expect(
      await getBlockData(graphContext, authentication, { block: testBlock }),
    ).toEqual(testBlockDataEntity);

    await updateBlockDataEntity(graphContext, authentication, {
      block: testBlock,
      newBlockDataEntity,
    });

    expect(
      await getBlockData(graphContext, authentication, { block: testBlock }),
    ).toEqual(newBlockDataEntity);
  });

  it("cannot update the block data entity to the same data entity", async () => {
    const authentication = { actorId: testUser.accountId };

    const currentDataEntity = await getBlockData(graphContext, authentication, {
      block: testBlock,
    });

    await expect(
      updateBlockDataEntity(graphContext, authentication, {
        block: testBlock,
        newBlockDataEntity: currentDataEntity,
      }),
    ).rejects.toThrow(/already has a linked block data entity with entity id/);
  });
});
