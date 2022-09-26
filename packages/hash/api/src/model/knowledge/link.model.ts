import {
  GraphApi,
  KnowledgeGraphQuery,
  PersistedLink,
} from "@hashintel/hash-graph-client";

import { EntityModel, LinkModel, LinkTypeModel } from "../index";

export type LinkModelConstructorParams = {
  ownedById: string;
  index?: number;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
};

export type LinkModelCreateParams = {
  createdBy: string;
  index?: number;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
};

/**
 * @class {@link LinkModel}
 */
export default class {
  ownedById: string;

  index?: number;

  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;

  constructor({
    ownedById,
    index,
    sourceEntityModel,
    linkTypeModel,
    targetEntityModel,
  }: LinkModelConstructorParams) {
    this.ownedById = ownedById;
    this.index = index;

    this.sourceEntityModel = sourceEntityModel;
    this.linkTypeModel = linkTypeModel;
    this.targetEntityModel = targetEntityModel;
  }

  static async fromPersistedLink(
    graphApi: GraphApi,
    {
      ownedById,
      inner: { sourceEntityId, targetEntityId, linkTypeId, index },
    }: PersistedLink,
  ): Promise<LinkModel> {
    const [sourceEntityModel, targetEntityModel, linkTypeModel] =
      await Promise.all([
        EntityModel.getLatest(graphApi, { entityId: sourceEntityId }),
        EntityModel.getLatest(graphApi, { entityId: targetEntityId }),
        LinkTypeModel.get(graphApi, { linkTypeId }),
      ]);

    return new LinkModel({
      ownedById,
      index,
      sourceEntityModel,
      linkTypeModel,
      targetEntityModel,
    });
  }

  static async getByQuery(
    graphApi: GraphApi,
    query: object,
    options?: Omit<Partial<KnowledgeGraphQuery>, "query">,
  ): Promise<LinkModel[]> {
    const { data: linkRootedSubgraphs } = await graphApi.getLinksByQuery({
      query,
      dataTypeQueryDepth: options?.dataTypeQueryDepth ?? 0,
      propertyTypeQueryDepth: options?.propertyTypeQueryDepth ?? 0,
      linkTypeQueryDepth: options?.linkTypeQueryDepth ?? 0,
      entityTypeQueryDepth: options?.entityTypeQueryDepth ?? 0,
      linkTargetEntityQueryDepth: options?.linkTargetEntityQueryDepth ?? 0,
      linkQueryDepth: options?.linkQueryDepth ?? 0,
    });

    return await Promise.all(
      linkRootedSubgraphs.map((linkRootedSubgraph) =>
        LinkModel.fromPersistedLink(graphApi, linkRootedSubgraph.link),
      ),
    );
  }

  /**
   * Create a link between a source and a target entity using a specific link
   * type, without modifying the indexes of its sibling links.
   *
   * @todo: deprecate this method when the Graph API handles updating the sibling indexes
   * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
   *
   * @param params.accountId the accountId of the account creating the link
   * @param params.sourceEntityModel the source entity of the link
   * @param params.linkTypeModel the Link Type of the link
   * @param params.targetEntityModel the target entity of the link
   */
  private static async createLinkWithoutUpdatingSiblings(
    graphApi: GraphApi,
    params: LinkModelCreateParams,
  ): Promise<LinkModel> {
    const {
      createdBy,
      sourceEntityModel,
      linkTypeModel,
      targetEntityModel,
      index,
    } = params;

    const { data: link } = await graphApi.createLink(
      sourceEntityModel.entityId,
      {
        /**
         * @todo figure out what account ID we use here
         *   Directly related to
         *   https://app.asana.com/0/1202805690238892/1202883599104674/f
         *   And may require consideration for
         *   https://app.asana.com/0/1202805690238892/1202890446280569/f
         */
        ownedById: createdBy,
        index,
        linkTypeId: linkTypeModel.schema.$id,
        targetEntityId: targetEntityModel.entityId,
      },
    );

    /**
     * @todo: this should be returned directly from the `createLink` method
     * @see https://app.asana.com/0/1202805690238892/1203045933021776/f
     */
    const persistedLink = {
      inner: link,
      ownedById: createdBy,
    };

    return LinkModel.fromPersistedLink(graphApi, persistedLink);
  }

  /**
   * Create a link between a source and a target entity using a specific link
   * type.
   *
   * @param params.accountId the accountId of the account creating the link
   * @param params.sourceEntityModel the source entity of the link
   * @param params.linkTypeModel the Link Type of the link
   * @param params.targetEntityModel the target entity of the link
   */
  static async create(
    graphApi: GraphApi,
    params: LinkModelCreateParams,
  ): Promise<LinkModel> {
    const { sourceEntityModel, linkTypeModel, createdBy } = params;
    const siblingLinks = await sourceEntityModel.getOutgoingLinks(graphApi, {
      linkTypeModel,
    });

    /**
     * @todo: rely on Graph API validation instead of manually checking whether sibling links are ordered
     * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
     */
    const hasOrderedSiblingLink = siblingLinks[0]?.index !== undefined;

    const index = hasOrderedSiblingLink
      ? // if siblings are ordered and an index is provided, use the provided index
        params.index ??
        // if siblings are ordered and no index is provided, default to the end of the list of links
        siblingLinks.length
      : siblingLinks.length === 0
      ? // if siblings are not ordered because there are no siblings, allow the link to be ordered
        params.index
      : // if siblings are not ordered and there are siblings, don't allow the link to be ordered
        undefined;

    if (index !== undefined) {
      /**
       * @todo: rely on Graph API to validate the index
       * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
       */
      if (index < 0 || index > siblingLinks.length) {
        throw new Error("Provided link index is out of bounds");
      }

      await Promise.all(
        siblingLinks
          .filter((sibling) => sibling.index! >= index)
          .map((sibling) =>
            sibling.updateWithoutUpdatingSiblings(graphApi, {
              updatedIndex: sibling.index! + 1,
              updatedBy: createdBy,
            }),
          ),
      );
    }

    return await LinkModel.createLinkWithoutUpdatingSiblings(graphApi, {
      ...params,
      index,
    });
  }

  /**
   * Update the link without modifying the indexes of its sibling links.
   *
   * @todo: deprecate this method when the Graph API handles updating the sibling indexes
   * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
   *
   * @param params.updatedIndex - the updated index of the link
   * @param params.updatedBy - the account updating the link
   */
  private async updateWithoutUpdatingSiblings(
    graphApi: GraphApi,
    params: { updatedIndex: number; updatedBy: string },
  ) {
    const { updatedIndex, updatedBy } = params;

    const { index: previousIndex } = this;

    if (previousIndex === undefined) {
      throw new Error("Cannot make an un-ordered link ordered");
    }

    if (previousIndex === updatedIndex) {
      throw new Error("No-op: link already has this index");
    }

    /**
     * @todo: call dedicated Graph API method to update the index of a link instead of re-creating the link manually
     * @see https://app.asana.com/0/1202805690238892/1203031430417465/f
     */
    await this.removeWithoutUpdatingSiblings(graphApi, {
      removedBy: updatedBy,
    });

    const updatedLink = await LinkModel.createLinkWithoutUpdatingSiblings(
      graphApi,
      {
        ...this,
        index: updatedIndex,
        createdBy: updatedBy,
      },
    );

    return updatedLink;
  }

  /**
   * Update the link
   *
   * @param params.updatedIndex - the updated index of the link
   * @param params.updatedBy - the account updating the link
   */
  async update(
    graphApi: GraphApi,
    params: { updatedIndex: number; updatedBy: string },
  ) {
    const { updatedIndex, updatedBy } = params;

    const { index: previousIndex, linkTypeModel } = this;

    const siblingLinks = await this.sourceEntityModel.getOutgoingLinks(
      graphApi,
      { linkTypeModel },
    );

    if (previousIndex === undefined) {
      throw new Error("Cannot make an un-ordered link ordered");
    }

    // Whether the index of the link is being increased
    const isIncreasingIndex = updatedIndex > previousIndex;

    // The minimum index of the affected sibling links
    const affectedSiblingsMinimumIndex = isIncreasingIndex
      ? previousIndex + 1
      : updatedIndex;

    // The maximum index of the affected sibling links
    const affectedSiblingsMaximumIndex = isIncreasingIndex
      ? updatedIndex
      : previousIndex - 1;

    const affectedSiblings = siblingLinks.filter(
      (sibling) =>
        sibling.index! >= affectedSiblingsMinimumIndex &&
        sibling.index! <= affectedSiblingsMaximumIndex,
    );

    /**
     * @todo: rely on the Graph API to maintain index integrity of sibling links on updates
     * @see https://app.asana.com/0/1202805690238892/1203031430417465/f
     */
    await Promise.all(
      affectedSiblings.map((sibling) =>
        sibling.updateWithoutUpdatingSiblings(graphApi, {
          updatedIndex: sibling.index! + (isIncreasingIndex ? -1 : 1),
          updatedBy,
        }),
      ),
    );

    return await this.updateWithoutUpdatingSiblings(graphApi, {
      updatedIndex,
      updatedBy,
    });
  }

  /**
   * Remove the link without modifying the indexes of its sibling links.
   *
   * @todo: deprecate this method when the Graph API handles updating the sibling indexes
   * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
   *
   * @param removedBy - the account removing the link
   */
  private async removeWithoutUpdatingSiblings(
    graphApi: GraphApi,
    { removedBy }: { removedBy: string },
  ): Promise<void> {
    await graphApi.removeLink(this.sourceEntityModel.entityId, {
      linkTypeId: this.linkTypeModel.schema.$id,
      targetEntityId: this.targetEntityModel.entityId,
      removedById: removedBy,
    });
  }

  /**
   * Remove the link.
   *
   * @param removedBy - the account removing the link
   */
  async remove(
    graphApi: GraphApi,
    { removedBy }: { removedBy: string },
  ): Promise<void> {
    await graphApi.removeLink(this.sourceEntityModel.entityId, {
      linkTypeId: this.linkTypeModel.schema.$id,
      targetEntityId: this.targetEntityModel.entityId,
      removedById: removedBy,
    });

    if (this.index !== undefined) {
      const siblingLinks = await this.sourceEntityModel.getOutgoingLinks(
        graphApi,
        {
          linkTypeModel: this.linkTypeModel,
        },
      );

      const affectedSiblings = siblingLinks.filter(
        (sibling) => sibling.index! > this.index!,
      );

      /**
       * @todo: rely on the Graph API to maintain index integrity of sibling links on updates
       * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
       */
      await Promise.all(
        affectedSiblings.map((sibling) =>
          sibling.updateWithoutUpdatingSiblings(graphApi, {
            updatedIndex: sibling.index! - 1,
            updatedBy: removedBy,
          }),
        ),
      );
    }
  }
}
