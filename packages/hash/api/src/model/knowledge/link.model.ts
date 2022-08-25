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
   * @param params.accountId the accountId of the account creating the entity
   * @param params.schema an `Entity`
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
}
