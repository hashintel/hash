import { ApolloError, UserInputError } from "apollo-server-express";
import { GraphApi } from "@hashintel/hash-graph-client";
import { generateKeyBetween } from "fractional-indexing";
import {
  EntityModel,
  PageModel,
  EntityModelCreateParams,
  BlockModel,
  LinkModel,
} from "..";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";

type PageModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel"
> & {
  title: string;
  summary?: string;
  prevIndex?: string;
  initialBlocks?: BlockModel[];
};

/**
 * @class {@link PageModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entity: EntityModel): PageModel {
    if (
      entity.entityTypeModel.schema.$id !==
      WORKSPACE_TYPES.entityType.page.schema.$id
    ) {
      throw new Error(
        `Entity with id ${entity.entityId} is not a workspace page`,
      );
    }

    return new PageModel(entity);
  }

  /**
   * Get a workspace page entity by its entity id.
   *
   * @param params.entityId - the entity id of the page
   */
  static async getPageById(
    graphApi: GraphApi,
    params: { entityId: string },
  ): Promise<PageModel> {
    const entity = await EntityModel.getLatest(graphApi, params);

    return PageModel.fromEntityModel(entity);
  }

  /**
   * Create a workspace page entity.
   *
   * @param params.title - the title of the page
   */
  static async createPage(
    graphApi: GraphApi,
    params: PageModelCreateParams,
  ): Promise<PageModel> {
    const { title, summary, prevIndex, accountId } = params;

    const index = generateKeyBetween(prevIndex ?? null, null);

    const properties: object = {
      [WORKSPACE_TYPES.propertyType.title.baseUri]: title,
      [WORKSPACE_TYPES.propertyType.summary.baseUri]: summary,
      [WORKSPACE_TYPES.propertyType.index.baseUri]: index,
    };

    const entityTypeModel = WORKSPACE_TYPES.entityType.page;

    const entity = await EntityModel.create(graphApi, {
      accountId,
      properties,
      entityTypeModel,
    });

    const page = PageModel.fromEntityModel(entity);

    const initialBlocks =
      params.initialBlocks && params.initialBlocks.length > 0
        ? params.initialBlocks
        : [
            await BlockModel.createBlock(graphApi, {
              accountId,
              componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
              blockData: await EntityModel.create(graphApi, {
                accountId,
                properties: {
                  [WORKSPACE_TYPES.propertyType.tokens.baseUri]: [],
                },
                entityTypeModel: WORKSPACE_TYPES.entityType.text,
              }),
            }),
          ];

    for (const block of initialBlocks) {
      await page.insertBlock(graphApi, {
        block,
        insertedBy: accountId,
      });
    }

    return page;
  }

  static async getAllPagesInAccount(
    graphApi: GraphApi,
    params: {
      accountId: string;
    },
  ): Promise<PageModel[]> {
    const pageEntityModels = await EntityModel.getByQuery(graphApi, {
      all: [
        { eq: [{ path: ["version"] }, { literal: "latest" }] },
        {
          eq: [
            { path: ["type", "versionedUri"] },
            { literal: WORKSPACE_TYPES.entityType.page.schema.$id },
          ],
        },
      ],
    });

    const pageModels = pageEntityModels
      /**
       * @todo: filter the pages by their ownedById in the query instead once it's supported
       * @see https://app.asana.com/0/1202805690238892/1203015527055374/f
       */
      .filter(({ accountId }) => accountId === params.accountId)
      .map(PageModel.fromEntityModel);

    return await Promise.all(
      pageModels.map(async (pageModel) => {
        if (await pageModel.isArchived(graphApi)) {
          return [];
        }
        return pageModel;
      }),
    ).then((filteredPages) => filteredPages.flat());
  }

  getTitle(): string {
    return (this.properties as any)[WORKSPACE_TYPES.propertyType.title.baseUri];
  }

  getSummary(): string | undefined {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.summary.baseUri
    ];
  }

  getIndex(): string | undefined {
    return (this.properties as any)[WORKSPACE_TYPES.propertyType.index.baseUri];
  }

  getArchived(): boolean | undefined {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.archived.baseUri
    ];
  }

  async isArchived(graphApi: GraphApi): Promise<Boolean> {
    if (this.getArchived()) {
      return true;
    }

    const parentPage = await this.getParentPage(graphApi);

    return parentPage ? await parentPage.isArchived(graphApi) : false;
  }

  async getParentPage(graphApi: GraphApi): Promise<PageModel | null> {
    const parentPageLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.parent,
    });

    const [parentPageLink, ...unexpectedParentPageLinks] = parentPageLinks;

    if (unexpectedParentPageLinks.length > 0) {
      throw new Error(
        `Critical: Page with entityId ${this.entityId} in account ${this.accountId} has more than one parent page`,
      );
    }

    if (!parentPageLink) {
      return null;
    }

    return PageModel.fromEntityModel(parentPageLink.targetEntityModel);
  }

  async hasParentPage(
    graphApi: GraphApi,
    params: {
      page: PageModel;
    },
  ): Promise<boolean> {
    const { page } = params;

    if (this.entityId === page.entityId) {
      throw new Error("A page cannot be the parent of itself");
    }

    const parentPage = await this.getParentPage(graphApi);

    if (!parentPage) {
      return false;
    }

    if (parentPage.entityId === page.entityId) {
      return true;
    }

    return parentPage.hasParentPage(graphApi, params);
  }

  async removeParentPage(
    graphApi: GraphApi,
    params: {
      removedByAccountId: string;
    },
  ): Promise<void> {
    const parentPageLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.parent,
    });

    const [parentPageLink, ...unexpectedParentPageLinks] = parentPageLinks;

    if (unexpectedParentPageLinks.length > 0) {
      throw new Error(
        `Critical: Page with entityId ${this.entityId} in account ${this.accountId} has more than one parent page`,
      );
    }

    if (!parentPageLink) {
      throw new Error(
        `Page with entityId ${this.entityId} in account ${this.accountId} does not have a parent page`,
      );
    }

    const { removedByAccountId } = params;

    await parentPageLink.remove(graphApi, { removedBy: removedByAccountId });
  }

  async setParentPage(
    graphApi: GraphApi,
    params: {
      parentPage: PageModel | null;
      setByAccountId: string;
      prevIndex: string | null;
      nextIndex: string | null;
    },
  ): Promise<void> {
    const { setByAccountId, parentPage, prevIndex, nextIndex } = params;

    const newIndex = generateKeyBetween(prevIndex, nextIndex);

    const existingParentPage = await this.getParentPage(graphApi);

    if (existingParentPage) {
      await this.removeParentPage(graphApi, {
        removedByAccountId: setByAccountId,
      });
    }

    if (parentPage) {
      /** Check whether adding the parent page would create a cycle */
      if (await parentPage.hasParentPage(graphApi, { page: this })) {
        throw new ApolloError(
          `Could not set '${parentPage.entityId}' as parent of '${this.entityId}', this would create a cyclic dependency.`,
          "CYCLIC_TREE",
        );
      }

      await this.createOutgoingLink(graphApi, {
        linkTypeModel: WORKSPACE_TYPES.linkType.parent,
        targetEntityModel: parentPage,
        createdBy: setByAccountId,
      });
    }

    if (this.getIndex() !== newIndex) {
      await this.updateProperty(graphApi, {
        propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.index.baseUri,
        value: newIndex,
        updatedByAccountId: this.accountId,
      });
    }
  }

  async getBlocks(graphApi: GraphApi): Promise<BlockModel[]> {
    const outgoingBlockDataLinks = await LinkModel.getByQuery(graphApi, {
      all: [
        {
          eq: [{ path: ["source", "id"] }, { literal: this.entityId }],
        },
        {
          eq: [
            { path: ["type", "versionedUri"] },
            {
              literal: WORKSPACE_TYPES.linkType.contain.schema.$id,
            },
          ],
        },
      ],
    });

    return outgoingBlockDataLinks.map(({ targetEntityModel }) =>
      BlockModel.fromEntityModel(targetEntityModel),
    );
  }

  async insertBlock(
    graphApi: GraphApi,
    params: {
      block: BlockModel;
      insertedBy: string;
      position?: number;
    },
  ) {
    const { position: specifiedPosition } = params;

    const { block, insertedBy } = params;

    await this.createOutgoingLink(graphApi, {
      targetEntityModel: block,
      linkTypeModel: WORKSPACE_TYPES.linkType.contain,
      index:
        specifiedPosition ??
        ((await this.getBlocks(graphApi)).length === 0 ? 0 : undefined),
      createdBy: insertedBy,
    });
  }

  async moveBlock(
    graphApi: GraphApi,
    params: {
      currentPosition: number;
      newPosition: number;
      movedByAccountId: string;
    },
  ) {
    const { currentPosition, newPosition } = params;

    const contentLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.contain,
    });

    if (currentPosition < 0 || currentPosition >= contentLinks.length) {
      throw new UserInputError(
        `invalid currentPosition: ${params.currentPosition}`,
      );
    }
    if (newPosition < 0 || newPosition >= contentLinks.length) {
      throw new UserInputError(`invalid newPosition: ${params.newPosition}`);
    }

    const link = contentLinks.find(({ index }) => index === currentPosition);

    if (!link) {
      throw new Error(
        `Critical: could not find contents link with index ${currentPosition} for page with entityId ${this.entityId} in account ${this.accountId}`,
      );
    }

    const { movedByAccountId } = params;

    await link.update(graphApi, {
      updatedIndex: newPosition,
      updatedBy: movedByAccountId,
    });
  }

  async removeBlock(
    graphApi: GraphApi,
    params: {
      position: number;
      removedByAccountId: string;
      allowRemovingFinal?: boolean;
    },
  ) {
    const { allowRemovingFinal, position } = params;

    const contentLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.contain,
    });

    if (position < 0 || position >= contentLinks.length) {
      throw new UserInputError(`invalid position: ${position}`);
    }

    const link = contentLinks.find(({ index }) => index === position);

    if (!link) {
      throw new Error(
        `Critical: could not find contents link with index ${position} for page with entityId ${this.entityId} in account ${this.accountId}`,
      );
    }

    if (!allowRemovingFinal && contentLinks.length === 1) {
      throw new Error("Cannot remove final block from page");
    }

    const { removedByAccountId } = params;

    await link.remove(graphApi, { removedBy: removedByAccountId });
  }
}
