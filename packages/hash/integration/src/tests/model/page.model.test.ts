import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { EntityType } from "@hashintel/hash-api/src/db/adapter";
import { Block, Entity, Page, User } from "@hashintel/hash-api/src/model";
import { WayToUseHash } from "@hashintel/hash-api/src/graphql/apiTypes.gen";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { recreateDbAndRunSchemaMigrations } from "../setup";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

let db: PostgresAdapter;

beforeAll(async () => {
  await recreateDbAndRunSchemaMigrations();

  db = new PostgresAdapter(
    {
      host: "localhost",
      user: "postgres",
      port: 5432,
      database: process.env.HASH_PG_DATABASE ?? "backend_integration_tests",
      password: "postgres",
      maxPoolSize: 10,
    },
    logger,
  );
});

describe("Page model class ", () => {
  let existingUser: User;
  let page: Page;

  let textSystemType: EntityType;

  beforeAll(async () => {
    existingUser = await User.createUser(db, {
      shortname: "test-user",
      preferredName: "Alice",
      emails: [{ address: "alice@hash.test", primary: true, verified: true }],
      infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
    });

    textSystemType = await db.getSystemTypeLatestVersion({
      systemTypeName: "Text",
    });
  });

  it("createPage method can create a valid page", async () => {
    const testTitle = "Test Page";
    page = await Page.createPage(db, {
      accountId: existingUser.accountId,
      createdBy: existingUser,
      properties: { title: testTitle },
    });

    // Expect the page's entity type to be the Page entity type
    expect(page.entityType.entityId).toBe(
      (await Page.getEntityType(db)).entityId,
    );
    expect(page.properties.title).toBe(testTitle);

    const pageBlocks = await page.getBlocks(db);

    // Expect the page to have exactly one block
    expect(pageBlocks).toHaveLength(1);

    const [block] = pageBlocks;

    const blockData = await block!.getBlockData(db);

    // Expect the block's entity's entity type to be the Text entity type
    expect(blockData.entityType.entityId).toBe(textSystemType.entityId);
  });

  it("insertBlock method can create and insert a new block", async () => {
    const blockData = await Entity.create(db, {
      accountId: existingUser.accountId,
      versioned: false,
      systemTypeName: "Text",
      properties: { tokens: [] },
      createdByAccountId: existingUser.accountId,
    });

    const blockToInsert = await Block.createBlock(db, {
      properties: {
        componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
      },
      blockData,
      accountId: existingUser.accountId,
      createdBy: existingUser,
    });

    await page.insertBlock(db, {
      block: blockToInsert,
      insertedByAccountId: existingUser.accountId,
    });

    const blocks = await page.getBlocks(db);

    expect(blocks).toHaveLength(2);

    const [_, insertedBlock] = blocks;

    expect(blockToInsert).toEqual(insertedBlock);
  });

  it("moveBlock method can move an existing block from one position to another", async () => {
    const prevBlocks = await page.getBlocks(db);

    expect(prevBlocks).toHaveLength(2);

    await page.moveBlock(db, {
      currentPosition: 0,
      newPosition: 1,
      movedByAccountId: existingUser.accountId,
    });

    const newBlocks = await page.getBlocks(db);

    expect(newBlocks).toHaveLength(2);

    expect(prevBlocks[0]).toEqual(newBlocks[1]);
    expect(prevBlocks[1]).toEqual(newBlocks[0]);
  });

  it("removeBlock method can remove existing block", async () => {
    const prevBlocks = await page.getBlocks(db);

    await page.removeBlock(db, {
      position: 0,
      removedByAccountId: existingUser.accountId,
    });

    const blocks = await page.getBlocks(db);

    expect(blocks.length).toBe(1);
    expect(blocks[0]).toEqual(prevBlocks[1]);
  });

  it("removeBlock method cannot remove block if it is the only block", async () => {
    await expect(
      page.removeBlock(db, {
        position: 0,
        removedByAccountId: existingUser.accountId,
      }),
    ).rejects.toThrowError(/Cannot remove final block from page/);
  });
});

afterAll(async () => {
  await db.close();
});
