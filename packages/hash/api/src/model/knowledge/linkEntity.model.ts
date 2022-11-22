import {
  GraphApi,
  Filter,
  EntityStructuralQuery,
} from "@hashintel/hash-graph-client";
import {
  EntityWithMetadata,
  Subgraph,
  LinkEntityMetadata,
  EntityMetadata,
  PropertyObject,
} from "@hashintel/hash-subgraph";
import { getRootsAsEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";

import { EntityModel, EntityTypeModel, LinkEntityModel } from "../index";

export type LinkModelConstructorParams = {
  linkEntity: EntityWithMetadata;
  linkEntityTypeModel: EntityTypeModel;
  leftEntityModel: EntityModel;
  rightEntityModel: EntityModel;
};

export type LinkModelCreateParams = {
  ownedById: string;
  properties?: PropertyObject;
  linkEntityTypeModel: EntityTypeModel;
  leftEntityModel: EntityModel;
  leftOrder?: number;
  rightEntityModel: EntityModel;
  rightOrder?: number;
  actorId: string;
};

/**
 * @class {@link LinkEntityModel}
 */
export default class extends EntityModel {
  leftEntityModel: EntityModel;

  rightEntityModel: EntityModel;

  get linkMetadata(): LinkEntityMetadata {
    return this.entity.getMetadata().linkMetadata!;
  }

  constructor({
    linkEntity,
    linkEntityTypeModel,
    leftEntityModel,
    rightEntityModel,
  }: LinkModelConstructorParams) {
    super({ entity: linkEntity, entityTypeModel: linkEntityTypeModel });
    this.leftEntityModel = leftEntityModel;
    this.rightEntityModel = rightEntityModel;
  }

  static async fromEntity(
    graphApi: GraphApi,
    linkEntity: EntityWithMetadata,
  ): Promise<LinkEntityModel> {
    if (!linkEntity.metadata.linkMetadata) {
      throw new Error(
        `Entity with ID ${linkEntity.metadata.editionId.baseId} is not a link`,
      );
    }

    const { entityTypeId } = linkEntity.metadata;

    const [linkEntityTypeModel, leftEntityModel, rightEntityModel] =
      await Promise.all([
        EntityTypeModel.get(graphApi, {
          entityTypeId,
        }),
        EntityModel.getLatest(graphApi, {
          entityId: linkEntity.metadata.linkMetadata.leftEntityId,
        }),
        EntityModel.getLatest(graphApi, {
          entityId: linkEntity.metadata.linkMetadata.rightEntityId,
        }),
      ]);

    return new LinkEntityModel({
      linkEntity,
      linkEntityTypeModel,
      leftEntityModel,
      rightEntityModel,
    });
  }

  static async getByQuery(
    graphApi: GraphApi,
    filter: Filter,
    options?: Omit<Partial<EntityStructuralQuery>, "filter">,
  ): Promise<LinkEntityModel[]> {
    const { data: subgraph } = await graphApi.getEntitiesByQuery({
      filter,
      graphResolveDepths: {
        dataTypeResolveDepth:
          options?.graphResolveDepths?.dataTypeResolveDepth ?? 0,
        propertyTypeResolveDepth:
          options?.graphResolveDepths?.propertyTypeResolveDepth ?? 0,
        entityTypeResolveDepth:
          options?.graphResolveDepths?.entityTypeResolveDepth ?? 0,
        entityResolveDepth:
          options?.graphResolveDepths?.entityResolveDepth ?? 0,
      },
    });

    return await Promise.all(
      getRootsAsEntities(subgraph as Subgraph).map((entity) =>
        LinkEntityModel.fromEntity(graphApi, entity),
      ),
    );
  }

  /**
   * Create a link entity between a left and a right entity.
   *
   * @param params.ownedById - the id of the account who owns the new link entity
   * @param params.linkEntityTypeModel - the link entity type of the link entity
   * @param params.leftEntityModel - the left entity of the link
   * @param params.leftOrder (optional) - the left order of the link entity
   * @param params.rightEntityModel - the right entity of the link
   * @param params.rightOrder (optional) - the right order of the link entity
   * @param params.actorId - the id of the account that is creating the link
   */
  static async createLinkEntity(
    graphApi: GraphApi,
    params: LinkModelCreateParams,
  ): Promise<LinkEntityModel> {
    const {
      ownedById,
      linkEntityTypeModel,
      actorId,
      leftEntityModel,
      leftOrder,
      rightEntityModel,
      rightOrder,
      properties = {},
    } = params;

    if (!linkEntityTypeModel.isLinkEntityType()) {
      throw new Error(
        `Entity type with ID "${linkEntityTypeModel.schema.$id}" is not a link entity type.`,
      );
    }

    const { data: linkEntityMetadata } = await graphApi.createEntity({
      ownedById,
      linkMetadata: {
        leftEntityId: leftEntityModel.baseId,
        leftOrder,
        rightEntityId: rightEntityModel.baseId,
        rightOrder,
      },
      actorId,
      entityTypeId: linkEntityTypeModel.schema.$id,
      properties,
    });

    return await LinkEntityModel.fromEntity(graphApi, {
      metadata: linkEntityMetadata as EntityMetadata,
      properties,
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
  private async updateLink(
    _graphApi: GraphApi,
    _params: { updatedLeftOrder?: number; updatedRightOrder?: number },
  ) {
    /**
     * @todo: implement this when `updateEntity` can update the link metadata of a link
     * @see https://app.asana.com/0/1202805690238892/1203384069111429/f
     */
  }
}
