import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import { createEntity } from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import type { Block } from "@apps/hash-api/src/graph/knowledge/system-types/block";
import { createBlock } from "@apps/hash-api/src/graph/knowledge/system-types/block";
import {
  addBlockToBlockCollection,
  moveBlockInBlockCollection,
  removeBlockFromBlockCollection,
} from "@apps/hash-api/src/graph/knowledge/system-types/block-collection";
import type { Page } from "@apps/hash-api/src/graph/knowledge/system-types/page";
import {
  createPage,
  getAllPagesInWorkspace,
  getPageBlocks,
  getPageById,
  getPageParentPage,
  setPageParentPage,
} from "@apps/hash-api/src/graph/knowledge/system-types/page";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { Logger } from "@local/hash-backend-utils/logger";
import { LinkEntity } from "@local/hash-graph-sdk/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  HasIndexedContent,
  Text,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { generateKeyBetween } from "fractional-indexing";
import { beforeAll, describe, expect, it } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

describe("Page", () => {
  let testUser: User;

  beforeAll(async () => {
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "pageTest", logger);

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: testUser.kratosIdentityId,
      });

      await resetGraph();
    };
  });

  const createTestBlock = async () => {
    const authentication = { actorId: testUser.accountId };

    const blockData = await createEntity<Text>(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      entityTypeId: systemEntityTypes.text.entityTypeId,
      properties: {
        value: {
          "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
            { value: [] },
        },
      },
      relationships: createDefaultAuthorizationRelationships({
        actorId: testUser.accountId,
      }),
    });

    return createBlock(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      componentId: "text",
      blockData,
    });
  };

  let testPage: Page;

  it("can create a page", async () => {
    const authentication = { actorId: testUser.accountId };

    testPage = await createPage(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      title: "Test Page",
      type: "document",
    });

    expect(testPage.title).toEqual("Test Page");
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
      type: "document",
    });

    const initialBlocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId: testPage2.entity.metadata.recordId.entityId,
        type: "document",
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
      type: "document",
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
  let testBlockLink1: LinkEntity<HasIndexedContent>;

  let testBlock2: Block;
  let testBlockLink2: LinkEntity<HasIndexedContent>;

  let testBlock3: Block;
  let testBlockLink3: LinkEntity<HasIndexedContent>;

  let firstKey: string;

  let testPageForBlockManipulation: Page;

  it("can insert blocks", async () => {
    const authentication = { actorId: testUser.accountId };

    const firstBlock = await createTestBlock();

    testPageForBlockManipulation = await createPage(
      graphContext,
      authentication,
      {
        initialBlocks: [firstBlock],
        ownedById: testUser.accountId as OwnedById,
        title: "Test Page for Block Manipulation",
        type: "document",
      },
    );

    const existingBlocks = await getPageBlocks(graphContext, authentication, {
      pageEntityId:
        testPageForBlockManipulation.entity.metadata.recordId.entityId,
      type: "document",
    });

    expect(existingBlocks).toHaveLength(1);

    testBlock1 = existingBlocks[0]!.rightEntity!;
    testBlockLink1 = new LinkEntity<HasIndexedContent>(
      existingBlocks[0]!.linkEntity,
    );

    [testBlock2, testBlock3] = await Promise.all([
      createTestBlock(),
      createTestBlock(),
    ]);

    // insert block at specified position
    testBlockLink2 = (await addBlockToBlockCollection(
      graphContext,
      authentication,
      {
        blockCollectionEntityId:
          testPageForBlockManipulation.entity.metadata.recordId.entityId,
        block: testBlock2,
        position: {
          indexPosition: {
            "https://hash.ai/@hash/types/property-type/fractional-index/":
              generateKeyBetween(
                testBlockLink1.properties[
                  "https://hash.ai/@hash/types/property-type/fractional-index/"
                ],
                null,
              ),
          },
        },
      },
    )) as unknown as LinkEntity<HasIndexedContent>;

    testBlockLink3 = (await addBlockToBlockCollection(
      graphContext,
      authentication,
      {
        blockCollectionEntityId:
          testPageForBlockManipulation.entity.metadata.recordId.entityId,
        block: testBlock3,
        position: {
          indexPosition: {
            "https://hash.ai/@hash/types/property-type/fractional-index/":
              generateKeyBetween(
                testBlockLink2.properties[
                  "https://hash.ai/@hash/types/property-type/fractional-index/"
                ],
                null,
              ),
          },
        },
      },
    )) as unknown as LinkEntity<HasIndexedContent>;

    const blocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId:
          testPageForBlockManipulation.entity.metadata.recordId.entityId,
        type: "document",
      })
    ).map((contentItem) => contentItem.rightEntity);
    const expectedBlocks = [testBlock1, testBlock2, testBlock3];

    expect(blocks).toHaveLength(expectedBlocks.length);
    expect(blocks).toEqual(expect.arrayContaining(expectedBlocks));
  });

  it("can move a block", async () => {
    const authentication = { actorId: testUser.accountId };

    firstKey = generateKeyBetween(
      null,
      testBlockLink1.properties[
        "https://hash.ai/@hash/types/property-type/fractional-index/"
      ],
    );

    await moveBlockInBlockCollection(graphContext, authentication, {
      linkEntityId: testBlockLink3.metadata.recordId.entityId,
      position: {
        indexPosition: {
          "https://hash.ai/@hash/types/property-type/fractional-index/":
            firstKey,
        },
      },
    });

    const initialBlocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId:
          testPageForBlockManipulation.entity.metadata.recordId.entityId,
        type: "document",
      })
    ).map((contentItem) => contentItem.rightEntity);
    const expectedInitialBlocks = [testBlock3, testBlock2, testBlock1];

    expect(initialBlocks).toHaveLength(expectedInitialBlocks.length);
    expect(initialBlocks).toEqual(
      expect.arrayContaining(expectedInitialBlocks),
    );

    await moveBlockInBlockCollection(graphContext, authentication, {
      linkEntityId: testBlockLink1.metadata.recordId.entityId,
      position: {
        indexPosition: {
          "https://hash.ai/@hash/types/property-type/fractional-index/":
            generateKeyBetween(null, firstKey),
        },
      },
    });

    const updatedBlocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId:
          testPageForBlockManipulation.entity.metadata.recordId.entityId,
        type: "document",
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
      linkEntityId: testBlockLink1.metadata.recordId.entityId,
    });

    const blocks = (
      await getPageBlocks(graphContext, authentication, {
        pageEntityId:
          testPageForBlockManipulation.entity.metadata.recordId.entityId,
        type: "document",
      })
    ).map((contentItem) => contentItem.rightEntity);
    const expectedBlocks = [testBlock2, testBlock3];

    expect(blocks).toHaveLength(expectedBlocks.length);
    expect(blocks).toEqual(expect.arrayContaining(expectedBlocks));
  });
});
