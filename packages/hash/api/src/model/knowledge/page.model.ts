import { ApolloError, UserInputError } from "apollo-server-express";
import { GraphApi } from "@hashintel/hash-graph-client";
import { generateKeyBetween } from "fractional-indexing";
import {
  EntityModel,
  PageModel,
  EntityModelCreateParams,
  BlockModel,
  LinkModel,
  UserModel,
  OrgModel,
  CommentModel,
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
    params: { entityId: string; entityVersion?: string },
  ): Promise<PageModel> {
    const { entityId, entityVersion } = params;

    const entity = entityVersion
      ? await EntityModel.getVersion(graphApi, {
          entityId,
          entityVersion,
        })
      : await EntityModel.getLatest(graphApi, {
          entityId,
        });

    return PageModel.fromEntityModel(entity);
  }

  /**
   * Create a workspace page entity.
   *
   * @param params.title - the title of the page
   *
   * @see {@link EntityModel.create} for the remaining params
   */
  static async createPage(
    graphApi: GraphApi,
    params: PageModelCreateParams,
  ): Promise<PageModel> {
    const { title, summary, prevIndex, ownedById } = params;

    const index = generateKeyBetween(prevIndex ?? null, null);

    const properties: object = {
      [WORKSPACE_TYPES.propertyType.title.baseUri]: title,
      [WORKSPACE_TYPES.propertyType.summary.baseUri]: summary,
      [WORKSPACE_TYPES.propertyType.index.baseUri]: index,
    };

    const entityTypeModel = WORKSPACE_TYPES.entityType.page;

    const entity = await EntityModel.create(graphApi, {
      ownedById,
      properties,
      entityTypeModel,
    });

    const page = PageModel.fromEntityModel(entity);

    const initialBlocks =
      params.initialBlocks && params.initialBlocks.length > 0
        ? params.initialBlocks
        : [
            await BlockModel.createBlock(graphApi, {
              ownedById,
              componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
              blockData: await EntityModel.create(graphApi, {
                ownedById,
                properties: {
                  [WORKSPACE_TYPES.propertyType.tokens.baseUri]: [],
                },
                entityTypeModel: WORKSPACE_TYPES.entityType.text,
              }),
            }),
          ];

    for (const block of initialBlocks) {
      await page.insertBlock(graphApi, { block });
    }

    return page;
  }

  /**
   * Get all the pages in an account.
   *
   * @param params.account - the user or org whose pages will be returned
   */
  static async getAllPagesInAccount(
    graphApi: GraphApi,
    params: {
      accountModel: UserModel | OrgModel;
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
      .filter(({ ownedById }) => ownedById === params.accountModel.entityId)
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

  /**
   * Get the value of the "Title" property of the page.
   */
  getTitle(): string {
    return (this.properties as any)[WORKSPACE_TYPES.propertyType.title.baseUri];
  }

  /**
   * Get the value of the "Summary" property of the page.
   */
  getSummary(): string | undefined {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.summary.baseUri
    ];
  }

  /**
   * Get the value of the "Index" property of the page.
   */
  getIndex(): string | undefined {
    return (this.properties as any)[WORKSPACE_TYPES.propertyType.index.baseUri];
  }

  /**
   * Get the value of the "Icon" property of the page.
   */
  getIcon(): string | undefined {
    return (this.properties as any)[WORKSPACE_TYPES.propertyType.icon.baseUri];
  }

  /**
   * Get the value of the "Archived" property of the page.
   */
  getArchived(): boolean | undefined {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.archived.baseUri
    ];
  }

  /**
   * Whether or not the page (or an ancestor of the page) is archived.
   */
  async isArchived(graphApi: GraphApi): Promise<Boolean> {
    if (this.getArchived()) {
      return true;
    }

    const parentPage = await this.getParentPage(graphApi);

    return parentPage ? await parentPage.isArchived(graphApi) : false;
  }

  /**
   * Get the parent page of the page.
   */
  async getParentPage(graphApi: GraphApi): Promise<PageModel | null> {
    const parentPageLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.parent,
    });

    const [parentPageLink, ...unexpectedParentPageLinks] = parentPageLinks;

    if (unexpectedParentPageLinks.length > 0) {
      throw new Error(
        `Critical: Page with entityId ${this.entityId} in account ${this.ownedById} has more than one parent page`,
      );
    }

    if (!parentPageLink) {
      return null;
    }

    return PageModel.fromEntityModel(parentPageLink.targetEntityModel);
  }

  /**
   * Whether the page (or an ancestor of the page) has a specific page as its parent.
   *
   * @param params.page - the page that may or not be the parent of this page.
   */
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

  /**
   * Remove the current parent page of the page.
   *
   * @param params.removedById - the account that is removing the parent page
   */
  async removeParentPage(
    graphApi: GraphApi,
    params: {
      removedById: string;
    },
  ): Promise<void> {
    const parentPageLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.parent,
    });

    const [parentPageLink, ...unexpectedParentPageLinks] = parentPageLinks;

    if (unexpectedParentPageLinks.length > 0) {
      throw new Error(
        `Critical: Page with entityId ${this.entityId} in account ${this.ownedById} has more than one parent page`,
      );
    }

    if (!parentPageLink) {
      throw new Error(
        `Page with entityId ${this.entityId} in account ${this.ownedById} does not have a parent page`,
      );
    }

    const { removedById } = params;

    await parentPageLink.remove(graphApi, { removedById });
  }

  /**
   * Set (or unset) the parent page of this page.
   *
   * @param params.parentPage - the new parent page (or `null`)
   * @param params.setById - the account that is setting the parent page
   * @param params.prevIndex - the index of the previous page
   * @param params.nextIndex- the index of the next page
   */
  async setParentPage(
    graphApi: GraphApi,
    params: {
      parentPageModel: PageModel | null;
      setById: string;
      prevIndex: string | null;
      nextIndex: string | null;
    },
  ): Promise<PageModel> {
    const { setById, parentPageModel, prevIndex, nextIndex } = params;

    const newIndex = generateKeyBetween(prevIndex, nextIndex);

    const existingParentPageModel = await this.getParentPage(graphApi);

    if (existingParentPageModel) {
      await this.removeParentPage(graphApi, {
        removedById: setById,
      });
    }

    if (parentPageModel) {
      // Check whether adding the parent page would create a cycle
      if (await parentPageModel.hasParentPage(graphApi, { page: this })) {
        throw new ApolloError(
          `Could not set '${parentPageModel.entityId}' as parent of '${this.entityId}', this would create a cyclic dependency.`,
          "CYCLIC_TREE",
        );
      }

      await this.createOutgoingLink(graphApi, {
        linkTypeModel: WORKSPACE_TYPES.linkType.parent,
        targetEntityModel: parentPageModel,
        ownedById: setById,
      });
    }

    if (this.getIndex() !== newIndex) {
      const updatedPageEntityModel = await this.updateProperty(graphApi, {
        propertyTypeBaseUri: WORKSPACE_TYPES.propertyType.index.baseUri,
        value: newIndex,
      });

      return PageModel.fromEntityModel(updatedPageEntityModel);
    }

    return this;
  }

  /**
   * Get the blocks in this page.
   */
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
              literal: WORKSPACE_TYPES.linkType.contains.schema.$id,
            },
          ],
        },
      ],
    });

    return outgoingBlockDataLinks.map(({ targetEntityModel }) =>
      BlockModel.fromEntityModel(targetEntityModel),
    );
  }

  async getComments(graphApi: GraphApi): Promise<CommentModel[]> {
    const blocks = await this.getBlocks(graphApi);

    const comments = await Promise.all(
      blocks.map((block) => block.getBlockComments(graphApi)),
    );

    return comments.flat();
  }

  /**
   * Insert a block into this page
   *
   * @param params.block - the block to insert in the page
   * @param params.position (optional) - the position of the block in the page
   */
  async insertBlock(
    graphApi: GraphApi,
    params: {
      block: BlockModel;
      position?: number;
    },
  ) {
    const { position: specifiedPosition } = params;

    const { block } = params;

    await this.createOutgoingLink(graphApi, {
      targetEntityModel: block,
      linkTypeModel: WORKSPACE_TYPES.linkType.contains,
      index:
        specifiedPosition ??
        // if position is not specified and there are no blocks currently in the page, specify the index of the link is `0`
        ((await this.getBlocks(graphApi)).length === 0 ? 0 : undefined),
      // assume that link to block is owned by the same account as the page
      ownedById: this.ownedById,
    });
  }

  /**
   * Move a block in the page from one position to another.
   *
   * @param params.currentPosition - the current position of the block being moved
   * @param params.newPosition - the new position of the block being moved
   * @param params.movedById - the id of the user that is moving the block
   */
  async moveBlock(
    graphApi: GraphApi,
    params: {
      currentPosition: number;
      newPosition: number;
      movedById: string;
    },
  ) {
    const { currentPosition, newPosition } = params;

    const contentLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.contains,
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
        `Critical: could not find contents link with index ${currentPosition} for page with entityId ${this.entityId} in account ${this.ownedById}`,
      );
    }

    const { movedById } = params;

    await link.update(graphApi, {
      updatedIndex: newPosition,
      updatedById: movedById,
    });
  }

  /**
   * Remove a block from the page.
   *
   * @param params.position - the position of the block being removed
   * @param params.removedById - the id of the user that is removing the block
   * @param params.allowRemovingFinal (optional) - whether or not removing the final block in the page should be permitted (defaults to `true`)
   */
  async removeBlock(
    graphApi: GraphApi,
    params: {
      position: number;
      removedById: string;
      allowRemovingFinal?: boolean;
    },
  ) {
    const { allowRemovingFinal = false, position } = params;

    const contentLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.contains,
    });

    if (position < 0 || position >= contentLinks.length) {
      throw new UserInputError(`invalid position: ${position}`);
    }

    const link = contentLinks.find(({ index }) => index === position);

    if (!link) {
      throw new Error(
        `Critical: could not find contents link with index ${position} for page with entityId ${this.entityId} in account ${this.ownedById}`,
      );
    }

    if (!allowRemovingFinal && contentLinks.length === 1) {
      throw new Error("Cannot remove final block from page");
    }

    const { removedById } = params;

    await link.remove(graphApi, { removedById });
  }
}
