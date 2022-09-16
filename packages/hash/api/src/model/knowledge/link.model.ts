import { GraphApi, Link as PersistedLink } from "@hashintel/hash-graph-client";

import { EntityModel, LinkModel, LinkTypeModel } from "../index";

export type LinkModelConstructorParams = {
  accountId: string;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
};

export type LinkModelCreateParams = {
  createdBy: string;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
};

/**
 * @class {@link LinkModel}
 */
export default class {
  accountId: string;

  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;

  constructor({
    accountId,
    sourceEntityModel,
    linkTypeModel,
    targetEntityModel,
  }: LinkModelConstructorParams) {
    this.accountId = accountId;

    this.sourceEntityModel = sourceEntityModel;
    this.linkTypeModel = linkTypeModel;
    this.targetEntityModel = targetEntityModel;
  }

  static async fromPersistedLink(
    graphApi: GraphApi,
    { sourceEntityId, targetEntityId, linkTypeUri }: PersistedLink,
  ): Promise<LinkModel> {
    const [sourceEntityModel, targetEntityModel, linkTypeModel] =
      await Promise.all([
        EntityModel.getLatest(graphApi, { entityId: sourceEntityId }),
        EntityModel.getLatest(graphApi, { entityId: targetEntityId }),
        LinkTypeModel.get(graphApi, { versionedUri: linkTypeUri }),
      ]);

    return new LinkModel({
      /** @todo: assign this from the `PersistedLink` as part of https://app.asana.com/0/1201095311341924/1202980861294706/f */
      accountId: "",
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
    }: LinkModelCreateParams,
  ): Promise<LinkModel> {
    const {
      data: { sourceEntityId, linkTypeUri, targetEntityId },
    } = await graphApi.createLink(sourceEntityModel.entityId, {
      ownedById: createdBy,
      linkTypeUri: linkTypeModel.schema.$id,
      targetEntityId: targetEntityModel.entityId,
    });

    const fetchedParams = {
      sourceEntityModel: await EntityModel.getLatest(graphApi, {
        accountId: createdBy,
        entityId: sourceEntityId,
      }),
      linkTypeModel: await LinkTypeModel.get(graphApi, {
        versionedUri: linkTypeUri,
      }),
      targetEntityModel: await EntityModel.getLatest(graphApi, {
        accountId: createdBy,
        entityId: targetEntityId,
      }),
    };

    return new LinkModel({
      accountId: createdBy,
      ...fetchedParams,
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
      linkTypeUri: this.linkTypeModel.schema.$id,
      targetEntityId: this.targetEntityModel.entityId,
      removedById: removedBy,
    });
  }

  /**
   * Get all outgoing links of a source entity.
   *
   * @param params.accountId the accountId of the account creating the link
   * @param params.sourceEntityModel the source entity of the link
   */
  static async getAllOutgoing(
    graphApi: GraphApi,
    { sourceEntityModel }: { sourceEntityModel: EntityModel },
  ): Promise<LinkModel[]> {
    const { data: entityLinks } = await graphApi.getEntityLinks(
      sourceEntityModel.entityId,
    );
    return Promise.all(
      entityLinks.map(
        async (link) =>
          new LinkModel({
            /**
             * @todo figure out what account ID we use here
             *   Directly related to
             *   https://app.asana.com/0/1202805690238892/1202883599104674/f
             *   And may require consideration for
             *   https://app.asana.com/0/1202805690238892/1202890446280569/f
             */
            accountId: sourceEntityModel.accountId,
            linkTypeModel: await LinkTypeModel.get(graphApi, {
              versionedUri: link.linkTypeUri,
            }),
            sourceEntityModel,
            targetEntityModel: await EntityModel.getLatest(graphApi, {
              /**
               * @todo figure out what account ID we use here
               *   https://app.asana.com/0/1202805690238892/1202883599104674/f */
              accountId: sourceEntityModel.accountId,
              entityId: link.targetEntityId,
            }),
          }),
      ),
    );
  }

  /**
   * Get the outgoing link of a source entity given a link type.
   *
   * @todo Once multi links (1:N links) can be created, we need to change this
   *   method appropriately to retrieve multi links
   *   https://app.asana.com/0/0/1202891272217988/f
   *
   * @param params.accountId the accountId of the account creating the link
   * @param params.sourceEntityModel the source entity of the link
   * @param params.linkTypeModel the Link Type of the link
   */
  static async getOutgoing(
    graphApi: GraphApi,
    {
      sourceEntityModel,
      linkTypeModel,
    }: { sourceEntityModel: EntityModel; linkTypeModel: LinkTypeModel },
  ): Promise<LinkModel[]> {
    /**
     * @todo use structural querying for this client-side fetch
     *   https://app.asana.com/0/1200211978612931/1202510174412974/f
     */
    const links = (
      await LinkModel.getAllOutgoing(graphApi, {
        sourceEntityModel,
      })
    ).filter(
      (link) => link.linkTypeModel.schema.$id === linkTypeModel.schema.$id,
    );
    /**
     * @todo this may return an array of links when we support 1:N links.
     *   see https://app.asana.com/0/0/1202891272217988/f
     */
    return links;
  }
}
