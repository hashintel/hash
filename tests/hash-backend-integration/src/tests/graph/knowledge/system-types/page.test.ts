import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { createEntity } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import {
  Block,
  createBlock,
} from "@apps/hash-api/src/graph/knowledge/system-types/block";
import {
  addBlockToBlockCollection,
  moveBlockInBlockCollection,
  removeBlockFromBlockCollection,
} from "@apps/hash-api/src/graph/knowledge/system-types/block-collection";
import {
  createPage,
  getAllPagesInWorkspace,
  getPageBlocks,
  getPageById,
  getPageParentPage,
  Page,
  setPageParentPage,
} from "@apps/hash-api/src/graph/knowledge/system-types/page";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "@apps/hash-api/src/graph/system-types";
import { systemUser } from "@apps/hash-api/src/graph/system-user";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { blockProtocolTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { OwnedById } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { resetGraph } from "../../../test-server";
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

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: systemUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });

    await resetGraph();
  });

  const createTestBlock = async () => {
    const authentication = { actorId: testUser.accountId };

    return createBlock(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      componentId: "text",
      blockData: await createEntity(graphContext, authentication, {
        ownedById: testUser.accountId as OwnedById,
        entityTypeId: SYSTEM_TYPES.entityType.text.schema.$id,
        properties: {
          [extractBaseUrl(
            blockProtocolTypes.propertyType.textualContent.propertyTypeId,
          )]: [],
        },
      }),
    });
  };

  let testPage: Page;

  it("can create a page", async () => {
    const authentication = { actorId: testUser.accountId };

    testPage = await createPage(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      title: "Test Page",
    });

    const initialBlocks = await getPageBlocks(graphContext, authentication, {
      pageEntityId: testPage.entity.metadata.recordId.entityId,
    });

    expect(initialBlocks).toHaveLength(1);
  });

  let testPage2: Page;

  it("can create a page with initial blocks", async () => {
    const authentication = { actorId: testUser.accountId };

    const [initialBlock1, initialBlock2] = await Promise.all([
      createTestBlock(),
      createTestBlock(),
    ]);

    testPage2 = await createPage(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      title: "Test Page 2",
      summary: "Test page 2 summary",
      initialBlocks: [initialBlock1, initialBlock2],
    });

    const initialBlocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId: testPage2.entity.metadata.recordId.entityId,
      })
    ).map((block) => block.rightEntity);
    const expectedInitialBlocks = [initialBlock1, initialBlock2];

    expect(initialBlocks).toHaveLength(expectedInitialBlocks.length);
    expect(initialBlocks).toEqual(
      expect.arrayContaining(expectedInitialBlocks),
    );
  });

  it("can get a page by its entity id", async () => {
    const authentication = { actorId: testUser.accountId };

    const fetchedPage = await getPageById(graphContext, authentication, {
      entityId: testPage.entity.metadata.recordId.entityId,
    });

    expect(fetchedPage).toEqual(testPage);
  });

  it("can get all pages in a workspace", async () => {
    const authentication = { actorId: testUser.accountId };

    const allPages = await getAllPagesInWorkspace(
      graphContext,
      authentication,
      {
        ownedById: testUser.accountId as OwnedById,
      },
    );

    expect(
      allPages.sort((a, b) =>
        a.entity.metadata.recordId.entityId.localeCompare(
          b.entity.metadata.recordId.entityId,
        ),
      ),
    ).toEqual(
      [testPage, testPage2].sort((a, b) =>
        a.entity.metadata.recordId.entityId.localeCompare(
          b.entity.metadata.recordId.entityId,
        ),
      ),
    );
  });

  let parentPage: Page;

  it("can get/set a parent page", async () => {
    const authentication = { actorId: testUser.accountId };

    parentPage = await createPage(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      title: "Test Parent Page",
      summary: "Test page summary",
    });

    expect(
      await getPageParentPage(graphContext, authentication, { page: testPage }),
    ).toBeNull();

    await setPageParentPage(graphContext, authentication, {
      page: testPage,
      parentPage,
      prevFractionalIndex: null,
      nextIndex: null,
    });
    expect(
      await getPageParentPage(graphContext, authentication, { page: testPage }),
    ).toEqual(parentPage);
  });

  let testBlock1: Block;

  let testBlock2: Block;

  let testBlock3: Block;

  it("can insert blocks", async () => {
    const authentication = { actorId: testUser.accountId };

    const existingBlocks = await getPageBlocks(graphContext, authentication, {
      pageEntityId: testPage.entity.metadata.recordId.entityId,
    });

    expect(existingBlocks).toHaveLength(1);

    testBlock1 = existingBlocks[0]!.rightEntity!;

    [testBlock2, testBlock3] = await Promise.all([
      createTestBlock(),
      createTestBlock(),
    ]);

    // insert block at un-specified position
    await addBlockToBlockCollection(graphContext, authentication, {
      blockCollectionEntity: testPage.entity,
      block: testBlock3,
    });
    // insert block at specified position
    await addBlockToBlockCollection(graphContext, authentication, {
      blockCollectionEntity: testPage.entity,
      block: testBlock2,
      position: 1,
    });

    const blocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId: testPage.entity.metadata.recordId.entityId,
      })
    ).map((contentItem) => contentItem.rightEntity);
    const expectedBlocks = [testBlock1, testBlock2, testBlock3];

    expect(blocks).toHaveLength(expectedBlocks.length);
    expect(blocks).toEqual(expect.arrayContaining(expectedBlocks));
  });

  it("can move a block", async () => {
    const authentication = { actorId: testUser.accountId };

    await moveBlockInBlockCollection(graphContext, authentication, {
      blockCollectionEntity: testPage.entity,
      currentPosition: 0,
      newPosition: 2,
    });

    const initialBlocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId: testPage.entity.metadata.recordId.entityId,
      })
    ).map((contentItem) => contentItem.rightEntity);
    const expectedInitialBlocks = [testBlock2, testBlock3, testBlock1];

    expect(initialBlocks).toHaveLength(expectedInitialBlocks.length);
    expect(initialBlocks).toEqual(
      expect.arrayContaining(expectedInitialBlocks),
    );

    await moveBlockInBlockCollection(graphContext, authentication, {
      blockCollectionEntity: testPage.entity,
      currentPosition: 2,
      newPosition: 0,
    });

    const updatedBlocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId: testPage.entity.metadata.recordId.entityId,
      })
    ).map((contentItem) => contentItem.rightEntity);
    const expectedUpdatedBlocks = [testBlock1, testBlock2, testBlock3];
    expect(updatedBlocks).toHaveLength(expectedUpdatedBlocks.length);
    expect(updatedBlocks).toEqual(
      expect.arrayContaining(expectedUpdatedBlocks),
    );
  });

  it("can remove blocks", async () => {
    const authentication = { actorId: testUser.accountId };

    await removeBlockFromBlockCollection(graphContext, authentication, {
      blockCollectionEntity: testPage.entity,
      position: 0,
    });

    const blocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId: testPage.entity.metadata.recordId.entityId,
      })
    ).map((contentItem) => contentItem.rightEntity);
    const expectedBlocks = [testBlock2, testBlock3];

    expect(blocks).toHaveLength(expectedBlocks.length);
    expect(blocks).toEqual(expect.arrayContaining(expectedBlocks));
  });
});
