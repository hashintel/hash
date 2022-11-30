import {
  GraphApi,
  Filter,
  EntityLinkOrder,
  GraphResolveDepths,
} from "@hashintel/hash-graph-client";
import {
  Subgraph,
  LinkEntityMetadata,
  EntityMetadata,
  PropertyObject,
  Entity,
} from "@hashintel/hash-subgraph";
import { getRootsAsEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";

import { EntityModel, EntityTypeModel, LinkEntityModel } from "../index";

export type LinkModelConstructorParams = {
  linkEntity: Entity;
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

  getLinkMetadata(): LinkEntityMetadata {
    return this.getMetadata().linkMetadata!;
  }

  static async fromEntity(
    graphApi: GraphApi,
    linkEntity: Entity,
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
    graphResolveDepths?: Partial<GraphResolveDepths>,
  ): Promise<LinkEntityModel[]> {
    const { data: subgraph } = await graphApi.getEntitiesByQuery({
      filter,
      graphResolveDepths: {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn: { outgoing: 0 },
        constrainsPropertiesOn: { outgoing: 0 },
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 0 },
        hasLeftEntity: { incoming: 0, outgoing: 0 },
        hasRightEntity: { incoming: 0, outgoing: 0 },
        ...graphResolveDepths,
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
        `Entity type with ID "${
          linkEntityTypeModel.getSchema().$id
        }" is not a link entity type.`,
      );
    }

    const { data: linkEntityMetadata } = await graphApi.createEntity({
      ownedById,
      linkMetadata: {
        leftEntityId: leftEntityModel.getBaseId(),
        leftOrder,
        rightEntityId: rightEntityModel.getBaseId(),
        rightOrder,
      },
      actorId,
      entityTypeId: linkEntityTypeModel.getSchema().$id,
      properties,
    });

    return await LinkEntityModel.fromEntity(graphApi, {
      metadata: linkEntityMetadata as EntityMetadata,
      properties,
    });
  }

  /**
   * Update an entity.
   *
   * @param params.properties - the properties object of the entity
   * @param params.actorId - the id of the account that is updating the entity
   */
  async update(
    graphApi: GraphApi,
    params: {
      properties: PropertyObject;
      leftOrder?: number;
      rightOrder?: number;
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { properties, actorId, leftOrder, rightOrder } = params;

    const { data: metadata } = await graphApi.updateEntity({
      actorId,
      entityId: this.getBaseId(),
      entityTypeId: this.entityTypeModel.getSchema().$id,
      properties,
      leftOrder,
      rightOrder,
    });

    return LinkEntityModel.fromEntity(graphApi, {
      metadata: metadata as EntityMetadata,
      properties,
    });
  }

  /**
   * Update the link without modifying the indices of its sibling links.
   *
   * @todo: deprecate this method when the Graph API handles updating the sibling indexes
   * @see https://app.asana.com/0/1200211978612931/1203031430417465/f
   *
   * @param params.linkOrder {EntityLinkOrder} - the new orders to update for the link
   * @param params.actorId - the id of the account that is updating the link
   */
  async updateOrder(
    graphApi: GraphApi,
    params: { linkOrder: EntityLinkOrder; actorId: string },
  ) {
    const { actorId, linkOrder } = params;
    const properties = this.getProperties();

    const { data: metadata } = await graphApi.updateEntity({
      actorId,
      entityId: this.getBaseId(),
      entityTypeId: this.entityTypeModel.getSchema().$id,
      properties,
      leftOrder: linkOrder.leftOrder,
      rightOrder: linkOrder.rightOrder,
    });

    return LinkEntityModel.fromEntity(graphApi, {
      metadata: metadata as EntityMetadata,
      properties,
    });
  }
}
