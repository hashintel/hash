import { GraphApi, PersistedLink } from "@hashintel/hash-graph-client";

import { EntityModel, LinkModel, LinkTypeModel } from "../index";

export type LinkModelConstructorParams = {
  ownedById: string;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
};

export type LinkModelCreateParams = {
  createdBy: string;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
  index?: number;
};

/**
 * @class {@link LinkModel}
 */
export default class {
  ownedById: string;

  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;

  constructor({
    ownedById,
    sourceEntityModel,
    linkTypeModel,
    targetEntityModel,
  }: LinkModelConstructorParams) {
    this.ownedById = ownedById;

    this.sourceEntityModel = sourceEntityModel;
    this.linkTypeModel = linkTypeModel;
    this.targetEntityModel = targetEntityModel;
  }

  static async fromPersistedLink(
    graphApi: GraphApi,
    {
      ownedById,
      inner: { sourceEntityId, targetEntityId, linkTypeId },
    }: PersistedLink,
  ): Promise<LinkModel> {
    const [sourceEntityModel, targetEntityModel, linkTypeModel] =
      await Promise.all([
        EntityModel.getLatest(graphApi, { entityId: sourceEntityId }),
        EntityModel.getLatest(graphApi, { entityId: targetEntityId }),
        LinkTypeModel.get(graphApi, { versionedUri: linkTypeId }),
      ]);

    return new LinkModel({
      ownedById,
      sourceEntityModel,
      linkTypeModel,
      targetEntityModel,
    });
  }

  static async getByQuery(
    graphApi: GraphApi,
    query: object,
  ): Promise<LinkModel[]> {
    const { data: linkRootedSubgraphs } = await graphApi.getLinksByQuery({
      query,
      dataTypeQueryDepth: 0,
      propertyTypeQueryDepth: 0,
      linkTypeQueryDepth: 0,
      entityTypeQueryDepth: 0,
      linkTargetEntityQueryDepth: 0,
      linkQueryDepth: 0,
    });

    return await Promise.all(
      linkRootedSubgraphs.map((linkRootedSubgraph) =>
        LinkModel.fromPersistedLink(graphApi, linkRootedSubgraph.link),
      ),
    );
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
    {
      createdBy,
      sourceEntityModel,
      linkTypeModel,
      targetEntityModel,
      index,
    }: LinkModelCreateParams,
  ): Promise<LinkModel> {
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
        linkTypeId: linkTypeModel.schema.$id,
        targetEntityId: targetEntityModel.entityId,
        index,
      },
    );

    return LinkModel.fromPersistedLink(graphApi, {
      inner: link,
      ownedById: createdBy,
    });
  }

  /**
   * Remove a link.
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
  }
}
