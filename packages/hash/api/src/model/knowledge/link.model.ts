import {
  LinkStructuralQuery,
  GraphApi,
  PersistedLink,
} from "@hashintel/hash-graph-client";

import { EntityModel, LinkModel, LinkTypeModel } from "../index";

export type LinkModelConstructorParams = {
  ownedById: string;
  index?: number;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
  createdById: string;
};

export type LinkModelCreateParams = {
  ownedById: string;
  index?: number;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
  actorId: string;
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

  createdById: string;

  constructor({
    ownedById,
    index,
    sourceEntityModel,
    linkTypeModel,
    targetEntityModel,
    createdById,
  }: LinkModelConstructorParams) {
    this.ownedById = ownedById;
    this.index = index;

    this.sourceEntityModel = sourceEntityModel;
    this.linkTypeModel = linkTypeModel;
    this.targetEntityModel = targetEntityModel;

    this.createdById = createdById;
  }

  static async fromPersistedLink(
    graphApi: GraphApi,
    {
      metadata: { ownedById, createdById },
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
      createdById,
    });
  }

  static async getByQuery(
    graphApi: GraphApi,
    filter: object,
    options?: Omit<Partial<LinkStructuralQuery>, "query">,
  ): Promise<LinkModel[]> {
    const { data: linkRootedSubgraphs } = await graphApi.getLinksByQuery({
      filter,
      graphResolveDepths: {
        dataTypeResolveDepth:
          options?.graphResolveDepths?.dataTypeResolveDepth ?? 0,
        propertyTypeResolveDepth:
          options?.graphResolveDepths?.propertyTypeResolveDepth ?? 0,
        linkTypeResolveDepth:
          options?.graphResolveDepths?.linkTypeResolveDepth ?? 0,
        entityTypeResolveDepth:
          options?.graphResolveDepths?.entityTypeResolveDepth ?? 0,
        linkResolveDepth: options?.graphResolveDepths?.linkResolveDepth ?? 0,
        linkTargetEntityResolveDepth:
          options?.graphResolveDepths?.linkTargetEntityResolveDepth ?? 0,
      },
    });

    return await Promise.all(
      linkRootedSubgraphs.map((linkRootedSubgraph) =>
        LinkModel.fromPersistedLink(graphApi, linkRootedSubgraph.link),
      ),
    );
  }

  static async get(
    graphApi: GraphApi,
    params: {
      sourceEntityId: string;
      targetEntityId: string;
      linkTypeId: string;
    },
  ): Promise<LinkModel> {
    const { sourceEntityId, targetEntityId, linkTypeId } = params;

    const linkModels = await LinkModel.getByQuery(graphApi, {
      all: [
        {
          equal: [{ path: ["source", "id"] }, { parameter: sourceEntityId }],
        },
        {
          equal: [{ path: ["target", "id"] }, { parameter: targetEntityId }],
        },
        {
          equal: [
            { path: ["type", "versionedUri"] },
            {
              parameter: linkTypeId,
            },
          ],
        },
      ],
    });

    const [linkModel] = linkModels;

    if (!linkModel) {
      throw new Error(
        `Link with source entity ID = '${sourceEntityId}', target entity ID = '${targetEntityId}' and link type ID = '${linkTypeId}' not found.`,
      );
    } else if (linkModels.length > 1) {
      throw new Error(`Could not identify one single link with query.`);
    }

    return linkModel;
  }

  /**
   * Create a link between a source and a target entity using a specific link
   * type, without modifying the indexes of its sibling links.
   *
   * @todo: deprecate this method when the Graph API handles updating the sibling indexes
   * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
   *
   * @param params.ownedById - the id of the account who owns the new link
   * @param params.sourceEntityModel - the source entity of the link
   * @param params.linkTypeModel - the link type of the link
   * @param params.targetEntityModel - the target entity of the link
   * @param params.actorId - the id of the account that is creating the link
   */
  static async createLinkWithoutUpdatingSiblings(
    graphApi: GraphApi,
    params: LinkModelCreateParams,
  ): Promise<LinkModel> {
    const {
      ownedById,
      sourceEntityModel,
      linkTypeModel,
      targetEntityModel,
      index,
      actorId,
    } = params;

    const { data: link } = await graphApi.createLink(
      sourceEntityModel.entityId,
      {
        ownedById,
        index,
        linkTypeId: linkTypeModel.schema.$id,
        targetEntityId: targetEntityModel.entityId,
        actorId,
      },
    );

    /**
     * @todo: this should be returned directly from the `createLink` method
     * @see https://app.asana.com/0/1202805690238892/1203045933021776/f
     */
    const persistedLink: PersistedLink = {
      inner: link,
      metadata: { ownedById, createdById: actorId },
    };

    return LinkModel.fromPersistedLink(graphApi, persistedLink);
  }

  /**
   * Create a link between a source and a target entity using a specific link
   * type.
   *
   * @param params.ownedById - the id of the account who owns the new link
   * @param params.sourceEntityModel - the source entity of the link
   * @param params.linkTypeModel - the link type of the link
   * @param params.targetEntityModel - the target entity of the link
   * @param params.createdById - the id of the account that is creating the link
   */
  static async create(
    graphApi: GraphApi,
    params: LinkModelCreateParams,
  ): Promise<LinkModel> {
    const { sourceEntityModel, linkTypeModel, actorId } = params;
    const siblingLinks = await sourceEntityModel.getOutgoingLinks(graphApi, {
      linkTypeModel,
    });

    /**
     * @todo: rely on Graph API validation instead of performing this check here
     * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
     */
    const isOrdered = sourceEntityModel.entityTypeModel.isOutgoingLinkOrdered({
      outgoingLinkType: linkTypeModel,
    });

    if (!isOrdered && params.index !== undefined) {
      throw new Error(
        "Cannot create indexed link on un-ordered outgoing links",
      );
    }

    const index = isOrdered
      ? // if the link is ordered and an index is provided, use the provided index
        params.index ??
        // if the link is ordered and no index is provided, default to the end of the list of links
        siblingLinks.length
      : undefined;

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
              actorId,
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
   * @param params.actorId - the id of the account that is updating the link
   */
  private async updateWithoutUpdatingSiblings(
    graphApi: GraphApi,
    params: { updatedIndex: number; actorId: string },
  ) {
    const { updatedIndex, actorId } = params;

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
    await this.removeWithoutUpdatingSiblings(graphApi, { actorId });

    const { ownedById, sourceEntityModel, linkTypeModel, targetEntityModel } =
      this;

    const updatedLink = await LinkModel.createLinkWithoutUpdatingSiblings(
      graphApi,
      {
        ownedById,
        sourceEntityModel,
        linkTypeModel,
        targetEntityModel,
        index: updatedIndex,
        actorId,
      },
    );

    return updatedLink;
  }

  /**
   * Update the link
   *
   * @param params.updatedIndex - the updated index of the link
   * @param params.actorId - the id of the account updating the link
   */
  async update(
    graphApi: GraphApi,
    params: { updatedIndex: number; actorId: string },
  ) {
    const { updatedIndex, actorId } = params;

    const { index: previousIndex, linkTypeModel } = this;

    /**
     * @todo: rely on Graph API validation instead of performing this check here
     * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
     */
    const isOrdered =
      this.sourceEntityModel.entityTypeModel.isOutgoingLinkOrdered({
        outgoingLinkType: linkTypeModel,
      });

    if (!isOrdered) {
      throw new Error("Cannot update the index of an un-ordered link");
    }

    const siblingLinks = await this.sourceEntityModel.getOutgoingLinks(
      graphApi,
      { linkTypeModel },
    );

    if (previousIndex === undefined) {
      throw new Error("Critical: existing ordered link doesn't have an index");
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
          actorId,
        }),
      ),
    );

    return await this.updateWithoutUpdatingSiblings(graphApi, {
      updatedIndex,
      actorId,
    });
  }

  /**
   * Remove the link without modifying the indexes of its sibling links.
   *
   * @todo: deprecate this method when the Graph API handles updating the sibling indexes
   * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
   *
   * @param actorId - the id of the account that is removing the link
   */
  async removeWithoutUpdatingSiblings(
    graphApi: GraphApi,
    { actorId }: { actorId: string },
  ): Promise<void> {
    await graphApi.removeLink(this.sourceEntityModel.entityId, {
      linkTypeId: this.linkTypeModel.schema.$id,
      targetEntityId: this.targetEntityModel.entityId,
      actorId,
    });
  }

  /**
   * Remove the link.
   *
   * @param params.removedById - the id of the account that is removing the link
   */
  async remove(graphApi: GraphApi, params: { actorId: string }): Promise<void> {
    const { actorId } = params;
    await graphApi.removeLink(this.sourceEntityModel.entityId, {
      linkTypeId: this.linkTypeModel.schema.$id,
      targetEntityId: this.targetEntityModel.entityId,
      actorId,
    });

    /**
     * @todo: rely on Graph API validation instead of performing this check here
     * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
     */
    const isOrdered =
      this.sourceEntityModel.entityTypeModel.isOutgoingLinkOrdered({
        outgoingLinkType: this.linkTypeModel,
      });

    if (isOrdered) {
      if (this.index === undefined) {
        throw new Error(
          "Critical: existing ordered link doesn't have an index",
        );
      }

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
            actorId,
          }),
        ),
      );
    }
  }
}
