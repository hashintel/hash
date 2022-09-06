import { GraphApi } from "@hashintel/hash-graph-client";

import { EntityModel, LinkModel, LinkTypeModel } from "../index";

export type LinkModelConstructorParams = {
  accountId: string;
  sourceEntityModel: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntityModel: EntityModel;
};

export type LinkModelCreateParams = {
  accountId: string;
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
      accountId,
      sourceEntityModel,
      linkTypeModel,
      targetEntityModel,
    }: LinkModelCreateParams,
  ): Promise<LinkModel> {
    const {
      data: { sourceEntityId, linkTypeUri, targetEntityId },
    } = await graphApi.createLink(sourceEntityModel.entityId, {
      accountId,
      linkTypeUri: linkTypeModel.schema.$id,
      targetEntityId: targetEntityModel.entityId,
    });

    const fetchedParams = {
      sourceEntityModel: await EntityModel.getLatest(graphApi, {
        accountId,
        entityId: sourceEntityId,
      }),
      linkTypeModel: await LinkTypeModel.get(graphApi, {
        versionedUri: linkTypeUri,
      }),
      targetEntityModel: await EntityModel.getLatest(graphApi, {
        accountId,
        entityId: targetEntityId,
      }),
    };

    return new LinkModel({
      accountId,
      ...fetchedParams,
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
  ): Promise<LinkModel | null> {
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
    return links[0] ? links[0] : null;
  }

  /**
   * Make a link inactive.
   */
  async inactivate(graphApi: GraphApi): Promise<void> {
    await graphApi.inactivateLink(this.sourceEntityModel.entityId, {
      linkTypeUri: this.linkTypeModel.schema.$id,
      targetEntityId: this.targetEntityModel.entityId,
    });
  }
}
