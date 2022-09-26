import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { createGraphClient } from "@hashintel/hash-api/src/graph";
import {
  ensureWorkspaceTypesExist,
  WORKSPACE_TYPES,
} from "@hashintel/hash-api/src/graph/workspace-types";
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
  serviceName: "org-membership-tests",
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
    await ensureWorkspaceTypesExist({ graphApi, logger });
    testUser = await createTestUser(graphApi, "pageModelTest", logger);
  });

  const createBlock = async () =>
    await BlockModel.createBlock(graphApi, {
      accountId: testUser.accountId,
      componentId: "dummy-component-id",
      blockData: await EntityModel.create(graphApi, {
        accountId: testUser.accountId,
        entityTypeModel: WORKSPACE_TYPES.entityType.dummy,
        properties: {},
      }),
    });

  let testPage: PageModel;

  it("can create a page", async () => {
    testPage = await PageModel.createPage(graphApi, {
      accountId: testUser.entityId,
      title: "Test Page",
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
      accountId: testUser.entityId,
      title: "Test Page 2",
      summary: "Test page 2 summary",
      initialBlocks: [initialBlock1, initialBlock2],
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
      account: testUser,
    });

    expect(
      allPages.sort((a, b) => a.entityId.localeCompare(b.entityId)),
    ).toEqual(
      [testPage, testPage2].sort((a, b) =>
        a.entityId.localeCompare(b.entityId),
      ),
    );
  });

  let parentPage: PageModel;

  it("can get/set a parent page", async () => {
    parentPage = await PageModel.createPage(graphApi, {
      accountId: testUser.entityId,
      title: "Test Parent Page",
      summary: "Test page summary",
    });

    expect(await testPage.getParentPage(graphApi)).toBeNull();

    await testPage.setParentPage(graphApi, {
      parentPage,
      setBy: testUser.accountId,
      prevIndex: null,
      nextIndex: null,
    });

    expect(await testPage.getParentPage(graphApi)).toEqual(parentPage);
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
      insertedBy: testUser.accountId,
    });

    // insert block at specified position
    await testPage.insertBlock(graphApi, {
      block: testBlock2,
      insertedBy: testUser.accountId,
      position: 1,
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
      movedBy: testUser.accountId,
    });

    expect(await testPage.getBlocks(graphApi)).toEqual([
      testBlock2,
      testBlock3,
      testBlock1,
    ]);

    await testPage.moveBlock(graphApi, {
      currentPosition: 2,
      newPosition: 0,
      movedBy: testUser.accountId,
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
      removedBy: testUser.accountId,
    });

    expect(await testPage.getBlocks(graphApi)).toEqual([
      testBlock2,
      testBlock3,
    ]);
  });
});
