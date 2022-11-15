import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import {
  ensureSystemTypesExist,
  SYSTEM_TYPES,
} from "@hashintel/hash-api/src/graph/system-types";
import {
  BlockModel,
  EntityModel,
  PageModel,
  UserModel,
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

describe("Page model class", () => {
  let testUser: UserModel;

  beforeAll(async () => {
    await ensureSystemTypesExist({ graphApi, logger });
    testUser = await createTestUser(graphApi, "pageModelTest", logger);
  });

  const createBlock = async () =>
    await BlockModel.createBlock(graphApi, {
      ownedById: testUser.entityId,
      componentId: "text",
      blockData: await EntityModel.create(graphApi, {
        ownedById: testUser.entityId,
        entityTypeModel: SYSTEM_TYPES.entityType.dummy,
        properties: {},
        actorId: testUser.entityId,
      }),
      actorId: testUser.entityId,
    });

  let testPage: PageModel;

  it("can create a page", async () => {
    testPage = await PageModel.createPage(graphApi, {
      ownedById: testUser.entityId,
      title: "Test Page",
      actorId: testUser.entityId,
    });

    const initialBlocks = await testPage.getBlocks(graphApi);

    expect(initialBlocks).toHaveLength(1);
  });

  let testPage2: PageModel;

  it("can create a page with initial blocks", async () => {
    const [initialBlock1, initialBlock2] = await Promise.all([
      createBlock(),
      createBlock(),
    ]);

    testPage2 = await PageModel.createPage(graphApi, {
      ownedById: testUser.entityId,
      title: "Test Page 2",
      summary: "Test page 2 summary",
      initialBlocks: [initialBlock1, initialBlock2],
      actorId: testUser.entityId,
    });

    const initialBlocks = await testPage2.getBlocks(graphApi);

    expect(initialBlocks).toEqual([initialBlock1, initialBlock2]);
  });

  it("can get a page by its entity id", async () => {
    const fetchedPage = await PageModel.getPageById(graphApi, {
      entityId: testPage.entityId,
    });

    expect(fetchedPage).toEqual(testPage);
  });

  it("can get all pages in an account", async () => {
    const allPages = await PageModel.getAllPagesInAccount(graphApi, {
      accountModel: testUser,
    });

    expect(
      allPages.sort((a, b) => a.entityId.localeCompare(b.entityId)),
    ).toEqual(
      [testPage, testPage2].sort((a, b) =>
        a.entityId.localeCompare(b.entityId),
      ),
    );
  });

  let parentPageModel: PageModel;

  it("can get/set a parent page", async () => {
    parentPageModel = await PageModel.createPage(graphApi, {
      ownedById: testUser.entityId,
      title: "Test Parent Page",
      summary: "Test page summary",
      actorId: testUser.entityId,
    });

    expect(await testPage.getParentPage(graphApi)).toBeNull();

    await testPage.setParentPage(graphApi, {
      parentPageModel,
      actorId: testUser.entityId,
      prevIndex: null,
      nextIndex: null,
    });

    expect(await testPage.getParentPage(graphApi)).toEqual(parentPageModel);
  });

  let testBlock1: BlockModel;

  let testBlock2: BlockModel;

  let testBlock3: BlockModel;

  it("can insert blocks", async () => {
    const existingBlocks = await testPage.getBlocks(graphApi);

    expect(existingBlocks).toHaveLength(1);

    testBlock1 = existingBlocks[0]!;

    [testBlock2, testBlock3] = await Promise.all([
      createBlock(),
      createBlock(),
    ]);

    // insert block at un-specified position
    await testPage.insertBlock(graphApi, {
      block: testBlock3,
      actorId: testUser.entityId,
      updateSiblings: true,
    });

    // insert block at specified position
    await testPage.insertBlock(graphApi, {
      block: testBlock2,
      updateSiblings: true,
      position: 1,
      actorId: testUser.entityId,
    });

    expect(await testPage.getBlocks(graphApi)).toEqual([
      testBlock1,
      testBlock2,
      testBlock3,
    ]);
  });

  it("can move a block", async () => {
    await testPage.moveBlock(graphApi, {
      currentPosition: 0,
      newPosition: 2,
      actorId: testUser.entityId,
    });

    expect(await testPage.getBlocks(graphApi)).toEqual([
      testBlock2,
      testBlock3,
      testBlock1,
    ]);

    await testPage.moveBlock(graphApi, {
      currentPosition: 2,
      newPosition: 0,
      actorId: testUser.entityId,
    });

    expect(await testPage.getBlocks(graphApi)).toEqual([
      testBlock1,
      testBlock2,
      testBlock3,
    ]);
  });

  it("can remove blocks", async () => {
    await testPage.removeBlock(graphApi, {
      position: 0,
      actorId: testUser.entityId,
      updateSiblings: true,
    });

    expect(await testPage.getBlocks(graphApi)).toEqual([
      testBlock2,
      testBlock3,
    ]);
  });
});
