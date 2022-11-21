import { ApolloError, UserInputError } from "apollo-server-express";
import { GraphApi } from "@hashintel/hash-graph-client";
import { generateKeyBetween } from "fractional-indexing";
import { EntityId, PropertyObject } from "@hashintel/hash-subgraph";
import {
  EntityModel,
  PageModel,
  EntityModelCreateParams,
  BlockModel,
  LinkEntityModel,
  UserModel,
  OrgModel,
  CommentModel,
} from "..";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError } from "../../lib/error";

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
      SYSTEM_TYPES.entityType.page.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entity.baseId,
        SYSTEM_TYPES.entityType.page.schema.$id,
        entity.entityTypeModel.schema.$id,
      );
    }

    return new PageModel({ entity, entityTypeModel: entity.entityTypeModel });
  }

  /**
   * Get a system page entity by its entity id.
   *
   * @param params.entityId - the entity id of the page
   */
  static async getPageById(
    graphApi: GraphApi,
    params: { entityId: EntityId; entityVersion?: string },
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
   * Create a system page entity.
   *
   * @param params.title - the title of the page
   *
   * @see {@link EntityModel.create} for the remaining params
   */
  static async createPage(
    graphApi: GraphApi,
    params: PageModelCreateParams,
  ): Promise<PageModel> {
    const { title, summary, prevIndex, ownedById, actorId } = params;

    const index = generateKeyBetween(prevIndex ?? null, null);

    const properties: PropertyObject = {
      [SYSTEM_TYPES.propertyType.title.baseUri]: title,
      ...(summary
        ? { [SYSTEM_TYPES.propertyType.summary.baseUri]: summary }
        : {}),
      ...(index ? { [SYSTEM_TYPES.propertyType.index.baseUri]: index } : {}),
    };

    const entityTypeModel = SYSTEM_TYPES.entityType.page;

    const entity = await EntityModel.create(graphApi, {
      ownedById,
      properties,
      entityTypeModel,
      actorId,
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
                  [SYSTEM_TYPES.propertyType.tokens.baseUri]: [],
                },
                entityTypeModel: SYSTEM_TYPES.entityType.text,
                actorId,
              }),
              actorId,
            }),
          ];

    for (const block of initialBlocks) {
      await page.insertBlock(graphApi, { block, actorId });
    }

    return page;
  }

  /**
   * Get all the pages in an account.
   *
   * @param params.accountModel - the user or org whose pages will be returned
   */
  static async getAllPagesInAccount(
    graphApi: GraphApi,
    params: {
      accountModel: UserModel | OrgModel;
    },
  ): Promise<PageModel[]> {
    const pageEntityModels = await EntityModel.getByQuery(graphApi, {
      all: [
        { equal: [{ path: ["version"] }, { parameter: "latest" }] },
        {
          equal: [
            { path: ["type", "versionedUri"] },
            { parameter: SYSTEM_TYPES.entityType.page.schema.$id },
          ],
        },
      ],
    });

    const pageModels = pageEntityModels
      /**
       * @todo: filter the pages by their ownedById in the query instead once it's supported
       * @see https://app.asana.com/0/1202805690238892/1203015527055374/f
       */
      .filter(({ ownedById }) => ownedById === params.accountModel.entityUuid)
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
    return (this.properties as any)[SYSTEM_TYPES.propertyType.title.baseUri];
  }

  /**
   * Get the value of the "Summary" property of the page.
   */
  getSummary(): string | undefined {
    return (this.properties as any)[SYSTEM_TYPES.propertyType.summary.baseUri];
  }

  /**
   * Get the value of the "Index" property of the page.
   */
  getIndex(): string | undefined {
    return (this.properties as any)[SYSTEM_TYPES.propertyType.index.baseUri];
  }

  /**
   * Get the value of the "Icon" property of the page.
   */
  getIcon(): string | undefined {
    return (this.properties as any)[SYSTEM_TYPES.propertyType.icon.baseUri];
  }

  /**
   * Get the value of the "Archived" property of the page.
   */
  getArchived(): boolean | undefined {
    return (this.properties as any)[SYSTEM_TYPES.propertyType.archived.baseUri];
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
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.parent,
    });

    const [parentPageLink, ...unexpectedParentPageLinks] = parentPageLinks;

    if (unexpectedParentPageLinks.length > 0) {
      throw new Error(
        `Critical: Page with entity ID ${this.baseId} has more than one parent page`,
      );
    }

    if (!parentPageLink) {
      return null;
    }

    return PageModel.fromEntityModel(parentPageLink.rightEntityModel);
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

    if (this.baseId === page.baseId) {
      throw new Error("A page cannot be the parent of itself");
    }

    const parentPage = await this.getParentPage(graphApi);

    if (!parentPage) {
      return false;
    }

    if (parentPage.baseId === page.baseId) {
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
      actorId: string;
    },
  ): Promise<void> {
    const parentPageLinks = await this.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.parent,
    });

    const [parentPageLink, ...unexpectedParentPageLinks] = parentPageLinks;

    if (unexpectedParentPageLinks.length > 0) {
      throw new Error(
        `Critical: Page with entityId ${this.baseId} has more than one parent page`,
      );
    }

    if (!parentPageLink) {
      throw new Error(
        `Page with entityId ${this.baseId} does not have a parent page`,
      );
    }

    const { actorId } = params;

    await parentPageLink.archive(graphApi, { actorId });
  }

  /**
   * Set (or unset) the parent page of this page.
   *
   * @param params.parentPage - the new parent page (or `null`)
   * @param params.actorId - the account that is setting the parent page
   * @param params.prevIndex - the index of the previous page
   * @param params.nextIndex- the index of the next page
   */
  async setParentPage(
    graphApi: GraphApi,
    params: {
      parentPageModel: PageModel | null;
      actorId: string;
      prevIndex: string | null;
      nextIndex: string | null;
    },
  ): Promise<PageModel> {
    const { actorId, parentPageModel, prevIndex, nextIndex } = params;

    const newIndex = generateKeyBetween(prevIndex, nextIndex);

    const existingParentPageModel = await this.getParentPage(graphApi);

    if (existingParentPageModel) {
      await this.removeParentPage(graphApi, { actorId });
    }

    if (parentPageModel) {
      // Check whether adding the parent page would create a cycle
      if (await parentPageModel.hasParentPage(graphApi, { page: this })) {
        throw new ApolloError(
          `Could not set '${parentPageModel.baseId}' as parent of '${this.baseId}', this would create a cyclic dependency.`,
          "CYCLIC_TREE",
        );
      }

      await this.createOutgoingLink(graphApi, {
        linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.parent,
        rightEntityModel: parentPageModel,
        ownedById: actorId,
        actorId,
      });
    }

    if (this.getIndex() !== newIndex) {
      const updatedPageEntityModel = await this.updateProperty(graphApi, {
        propertyTypeBaseUri: SYSTEM_TYPES.propertyType.index.baseUri,
        value: newIndex,
        actorId,
      });

      return PageModel.fromEntityModel(updatedPageEntityModel);
    }

    return this;
  }

  /**
   * Get the blocks in this page.
   */
  async getBlocks(graphApi: GraphApi): Promise<BlockModel[]> {
    const outgoingBlockDataLinks = await LinkEntityModel.getByQuery(graphApi, {
      all: [
        {
          equal: [
            { path: ["leftEntity", "uuid"] },
            { parameter: this.entityUuid },
          ],
        },
        {
          equal: [
            { path: ["leftEntity", "ownedById"] },
            { parameter: this.ownedById },
          ],
        },
        {
          equal: [
            { path: ["type", "versionedUri"] },
            {
              parameter: SYSTEM_TYPES.linkEntityType.contains.schema.$id,
            },
          ],
        },
        {
          equal: [{ path: ["version"] }, { parameter: "latest" }],
        },
        {
          equal: [{ path: ["archived"] }, { parameter: false }],
        },
      ],
    });

    return outgoingBlockDataLinks.map(({ rightEntityModel }) =>
      BlockModel.fromEntityModel(rightEntityModel),
    );
  }

  /**
   * Get the comments in this page's blocks.
   */
  async getComments(graphApi: GraphApi): Promise<CommentModel[]> {
    const blocks = await this.getBlocks(graphApi);

    const comments = await Promise.all(
      blocks.map((block) => block.getBlockComments(graphApi)),
    );

    return comments
      .flat()
      .filter((comment) => !comment.getResolvedAt() && !comment.getDeletedAt());
  }

  /**
   * Insert a block into this page
   *
   * @param params.block - the block to insert in the page
   * @param params.position (optional) - the position of the block in the page
   * @param params.insertedById - the id of the account that is inserting the block into the page
   */
  async insertBlock(
    graphApi: GraphApi,
    params: {
      block: BlockModel;
      position?: number;
      actorId: string;
    },
  ) {
    const { position: specifiedPosition, actorId } = params;

    const { block } = params;

    await this.createOutgoingLink(graphApi, {
      rightEntityModel: block,
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.contains,
      leftOrder:
        specifiedPosition ??
        // if position is not specified and there are no blocks currently in the page, specify the index of the link is `0`
        ((await this.getBlocks(graphApi)).length === 0 ? 0 : undefined),
      // assume that link to block is owned by the same account as the page
      ownedById: this.ownedById,
      actorId,
    });
  }

  /**
   * Move a block in the page from one position to another.
   *
   * @param params.currentPosition - the current position of the block being moved
   * @param params.newPosition - the new position of the block being moved
   * @param params.movedById - the id of the account that is moving the block
   */
  async moveBlock(
    graphApi: GraphApi,
    params: {
      currentPosition: number;
      newPosition: number;
      actorId: string;
    },
  ) {
    const { currentPosition, newPosition, actorId } = params;

    const contentLinks = await this.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.contains,
    });

    if (currentPosition < 0 || currentPosition >= contentLinks.length) {
      throw new UserInputError(
        `invalid currentPosition: ${params.currentPosition}`,
      );
    }
    if (newPosition < 0 || newPosition >= contentLinks.length) {
      throw new UserInputError(`invalid newPosition: ${params.newPosition}`);
    }

    const link = contentLinks.find(
      ({ linkMetadata }) => linkMetadata.leftOrder === currentPosition,
    );

    if (!link) {
      throw new Error(
        `Critical: could not find contents link with index ${currentPosition} for page with entityId ${this.baseId}`,
      );
    }

    await link.updateOrder(graphApi, {
      linkOrder: {
        leftOrder: newPosition
      },
      actorId,
    });
  }

  /**
   * Remove a block from the page.
   *
   * @param params.position - the position of the block being removed
   * @param params.actorId - the id of the account that is removing the block
   * @param params.allowRemovingFinal (optional) - whether or not removing the final block in the page should be permitted (defaults to `true`)
   */
  async removeBlock(
    graphApi: GraphApi,
    params: {
      position: number;
      actorId: string;
      allowRemovingFinal?: boolean;
    },
  ) {
    const { allowRemovingFinal = false, position, actorId } = params;

    const contentLinkEntityModels = await this.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.contains,
    });

    /**
     * @todo currently the count of outgoing links are not the best indicator of a valid position
     *   as page saving could assume index positions higher than the number of blocks.
     *   Ideally we'd be able to atomically rearrange all blocks as we're removing/adding blocks.
     *   see: https://app.asana.com/0/1200211978612931/1203031430417465/f
     */

    const linkEntityModel = contentLinkEntityModels.find(
      ({ linkMetadata }) => linkMetadata.leftOrder === position,
    );

    if (!linkEntityModel) {
      throw new Error(
        `Critical: could not find contents link with index ${position} for page with entity ID ${this.baseId}`,
      );
    }

    if (!allowRemovingFinal && contentLinkEntityModels.length === 1) {
      throw new Error("Cannot remove final block from page");
    }

    await linkEntityModel.archive(graphApi, { actorId });
  }
}
