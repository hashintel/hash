import { TypeSystemInitializer } from "@blockprotocol/type-system";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { createEntity } from "@hashintel/hash-api/src/graph/knowledge/primitive/entity";
import {
  Block,
  createBlock,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/block";
import {
  addBlockToPage,
  createPage,
  getAllPagesInWorkspace,
  getPageBlocks,
  getPageById,
  getPageParentPage,
  moveBlockInPage,
  Page,
  removeBlockFromPage,
  setPageParentPage,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/page";
import { User } from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "@hashintel/hash-api/src/graph/system-types";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { OwnedById } from "@hashintel/hash-shared/types";

import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

describe("Page", () => {
  let testUser: User;

  beforeAll(async () => {
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "pageTest", logger);
  });

  const createTestBlock = async () =>
    await createBlock(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      componentId: "text",
      blockData: await createEntity(graphContext, {
        ownedById: testUser.accountId as OwnedById,
        entityTypeId: SYSTEM_TYPES.entityType.text.schema.$id,
        properties: {
          [SYSTEM_TYPES.propertyType.tokens.metadata.editionId.baseId]: [],
        },
        actorId: testUser.accountId,
      }),
      actorId: testUser.accountId,
    });

  let testPage: Page;

  it("can create a page", async () => {
    testPage = await createPage(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      title: "Test Page",
      actorId: testUser.accountId,
    });

    const initialBlocks = await getPageBlocks(graphContext, { page: testPage });

    expect(initialBlocks).toHaveLength(1);
  });

  let testPage2: Page;

  it("can create a page with initial blocks", async () => {
    const [initialBlock1, initialBlock2] = await Promise.all([
      createTestBlock(),
      createTestBlock(),
    ]);

    testPage2 = await createPage(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      title: "Test Page 2",
      summary: "Test page 2 summary",
      initialBlocks: [initialBlock1, initialBlock2],
      actorId: testUser.accountId,
    });

    const initialBlocks = await getPageBlocks(graphContext, {
      page: testPage2,
    });
    const expectedInitialBlocks = [initialBlock1, initialBlock2];

    expect(initialBlocks).toHaveLength(expectedInitialBlocks.length);
    expect(initialBlocks).toEqual(
      expect.arrayContaining(expectedInitialBlocks),
    );
  });

  it("can get a page by its entity id", async () => {
    const fetchedPage = await getPageById(graphContext, {
      entityId: testPage.entity.metadata.editionId.baseId,
    });

    expect(fetchedPage).toEqual(testPage);
  });

  it("can get all pages in a workspace", async () => {
    const allPages = await getAllPagesInWorkspace(graphContext, {
      workspace: testUser,
    });

    expect(
      allPages.sort((a, b) =>
        a.entity.metadata.editionId.baseId.localeCompare(
          b.entity.metadata.editionId.baseId,
        ),
      ),
    ).toEqual(
      [testPage, testPage2].sort((a, b) =>
        a.entity.metadata.editionId.baseId.localeCompare(
          b.entity.metadata.editionId.baseId,
        ),
      ),
    );
  });

  let parentPage: Page;

  it("can get/set a parent page", async () => {
    parentPage = await createPage(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      title: "Test Parent Page",
      summary: "Test page summary",
      actorId: testUser.accountId,
    });

    expect(
      await getPageParentPage(graphContext, { page: testPage }),
    ).toBeNull();

    await setPageParentPage(graphContext, {
      page: testPage,
      parentPage,
      actorId: testUser.accountId,
      prevIndex: null,
      nextIndex: null,
    });
    expect(await getPageParentPage(graphContext, { page: testPage })).toEqual(
      parentPage,
    );
  });

  let testBlock1: Block;

  let testBlock2: Block;

  let testBlock3: Block;

  it("can insert blocks", async () => {
    const existingBlocks = await getPageBlocks(graphContext, {
      page: testPage,
    });

    expect(existingBlocks).toHaveLength(1);

    testBlock1 = existingBlocks[0]!;

    [testBlock2, testBlock3] = await Promise.all([
      createTestBlock(),
      createTestBlock(),
    ]);

    // insert block at un-specified position
    await addBlockToPage(graphContext, {
      page: testPage,
      block: testBlock3,
      actorId: testUser.accountId,
    });
    // insert block at specified position
    await addBlockToPage(graphContext, {
      page: testPage,
      block: testBlock2,
      position: 1,
      actorId: testUser.accountId,
    });

    const blocks = await getPageBlocks(graphContext, { page: testPage });
    const expectedBlocks = [testBlock1, testBlock2, testBlock3];

    expect(blocks).toHaveLength(expectedBlocks.length);
    expect(blocks).toEqual(expect.arrayContaining(expectedBlocks));
  });

  it("can move a block", async () => {
    await moveBlockInPage(graphContext, {
      page: testPage,
      currentPosition: 0,
      newPosition: 2,
      actorId: testUser.accountId,
    });

    const initialBlocks = await getPageBlocks(graphContext, { page: testPage });
    const expectedInitialBlocks = [testBlock2, testBlock3, testBlock1];

    expect(initialBlocks).toHaveLength(expectedInitialBlocks.length);
    expect(initialBlocks).toEqual(
      expect.arrayContaining(expectedInitialBlocks),
    );

    await moveBlockInPage(graphContext, {
      page: testPage,
      currentPosition: 2,
      newPosition: 0,
      actorId: testUser.accountId,
    });

    const updatedBlocks = await getPageBlocks(graphContext, { page: testPage });
    const expectedUpdatedBlocks = [testBlock1, testBlock2, testBlock3];
    expect(updatedBlocks).toHaveLength(expectedUpdatedBlocks.length);
    expect(updatedBlocks).toEqual(
      expect.arrayContaining(expectedUpdatedBlocks),
    );
  });

  it("can remove blocks", async () => {
    await removeBlockFromPage(graphContext, {
      page: testPage,
      position: 0,
      actorId: testUser.accountId,
    });

    const blocks = await getPageBlocks(graphContext, { page: testPage });
    const expectedBlocks = [testBlock2, testBlock3];

    expect(blocks).toHaveLength(expectedBlocks.length);
    expect(blocks).toEqual(expect.arrayContaining(expectedBlocks));
  });
});
