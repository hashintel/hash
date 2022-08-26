import { GraphApi } from "@hashintel/hash-graph-client";

import { EntityModel, LinkModel, LinkTypeModel } from "../index";

export type LinkModelConstructorParams = {
  accountId: string;
  sourceEntity: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntity: EntityModel;
};

export type LinkModelCreateParams = {
  accountId: string;
  sourceEntity: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntity: EntityModel;
};

/**
 * @class {@link LinkModel}
 */
export default class {
  accountId: string;

  sourceEntity: EntityModel;
  linkTypeModel: LinkTypeModel;
  targetEntity: EntityModel;

  constructor({
    accountId,
    sourceEntity,
    linkTypeModel,
    targetEntity,
  }: LinkModelConstructorParams) {
    this.accountId = accountId;

    this.sourceEntity = sourceEntity;
    this.linkTypeModel = linkTypeModel;
    this.targetEntity = targetEntity;
  }

  /**
   * Create a link between a source and a target entity using a specific link
   * type.
   *
   * @param params.accountId the accountId of the account creating the link
   * @param params.sourceEntity the source entity of the link
   * @param params.linkTypeModel the Link Type of the link
   * @param params.targetEntity the target entity of the link
   */
  static async create(
    graphApi: GraphApi,
    {
      accountId,
      sourceEntity,
      linkTypeModel,
      targetEntity,
    }: LinkModelCreateParams,
  ): Promise<LinkModel> {
    const {
      data: { sourceEntityId, linkTypeUri, targetEntityId },
    } = await graphApi.createLink(sourceEntity.entityId, {
      accountId,
      linkTypeUri: linkTypeModel.schema.$id,
      targetEntityId: targetEntity.entityId,
    });

    const fetchedParams = {
      sourceEntity: await EntityModel.getLatest(graphApi, {
        accountId,
        entityId: sourceEntityId,
      }),
      linkTypeModel: await LinkTypeModel.get(graphApi, {
        versionedUri: linkTypeUri,
      }),
      targetEntity: await EntityModel.getLatest(graphApi, {
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
   * @param params.sourceEntity the source entity of the link
   */
  static async getAllOutgoing(
    graphApi: GraphApi,
    { sourceEntity }: { sourceEntity: EntityModel },
  ): Promise<LinkModel[]> {
    const { data: entityLinks } = await graphApi.getEntityLinks(
      sourceEntity.entityId,
    );
    return Promise.all(
      Object.entries(entityLinks.outgoing)
        /**
         * When target entity id is a list the link has many targets.
         * This is not supported yet
         * @todo support 1:N links
         * */
        .filter(([_, targetEntityId]) => typeof targetEntityId === "string")
        .map(
          async ([linkTypeUri, targetEntityId]) =>
            new LinkModel({
              accountId: sourceEntity.accountId,
              linkTypeModel: await LinkTypeModel.get(graphApi, {
                versionedUri: linkTypeUri,
              }),
              sourceEntity,
              targetEntity: await EntityModel.getLatest(graphApi, {
                /** @todo figure out what account ID we use here */
                accountId: sourceEntity.accountId,
                entityId: targetEntityId,
              }),
            }),
        ),
    );
  }

  /**
   * Get the outgoing link of a source entity given a link type.
   *
   * @param params.accountId the accountId of the account creating the link
   * @param params.sourceEntity the source entity of the link
   * @param params.linkTypeModel the Link Type of the link
   */
  static async getOutgoing(
    graphApi: GraphApi,
    {
      sourceEntity,
      linkTypeModel,
    }: { sourceEntity: EntityModel; linkTypeModel: LinkTypeModel },
  ): Promise<LinkModel | null> {
    /** @todo use structural querying for this client-side fetch */
    const links = (
      await LinkModel.getAllOutgoing(graphApi, { sourceEntity })
    ).filter(
      (link) => link.linkTypeModel.schema.$id === linkTypeModel.schema.$id,
    );
    /** @todo the may return an array of links whe nwe support 1:N links. */
    return links[0] ? links[0] : null;
  }

  /**
   * Make a link inactive.
   */
  async inactivate(graphApi: GraphApi): Promise<void> {
    await graphApi.inactivateLink(this.sourceEntity.entityId, {
      linkTypeUri: this.linkTypeModel.schema.$id,
      targetEntityId: this.targetEntity.entityId,
    });
  }
}
