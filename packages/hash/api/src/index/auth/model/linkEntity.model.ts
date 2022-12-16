import {
  GraphApi,
  Filter,
  EntityLinkOrder,
  GraphResolveDepths,
} from "@hashintel/hash-graph-client";
import {
  Subgraph,
  LinkData,
  EntityMetadata,
  PropertyObject,
  Entity,
  EntityTypeWithMetadata,
} from "@hashintel/hash-subgraph";
import { getRootsAsEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import {
  getEntityTypeById,
  isEntityTypeLinkEntityType,
} from "./entity.model/entity-type";

import { EntityModel, LinkEntityModel } from "../model";

export type LinkModelConstructorParams = {
  linkEntity: Entity;
  linkEntityType: EntityTypeWithMetadata;
  leftEntityModel: EntityModel;
  rightEntityModel: EntityModel;
};

export type LinkModelCreateParams = {
  ownedById: string;
  properties?: PropertyObject;
  linkEntityType: EntityTypeWithMetadata;
  leftEntityModel: EntityModel;
  leftToRightOrder?: number;
  rightEntityModel: EntityModel;
  rightToLeftOrder?: number;
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
    linkEntityType,
    leftEntityModel,
    rightEntityModel,
  }: LinkModelConstructorParams) {
    super({ entity: linkEntity, entityType: linkEntityType });
    this.leftEntityModel = leftEntityModel;
    this.rightEntityModel = rightEntityModel;
  }

  getLinkData(): LinkData {
    return this.entity.linkData!;
  }

  static async fromEntity(
    graphApi: GraphApi,
    linkEntity: Entity,
  ): Promise<LinkEntityModel> {
    if (!linkEntity.linkData) {
      throw new Error(
        `Entity with ID ${linkEntity.metadata.editionId.baseId} is not a link`,
      );
    }

    const { entityTypeId } = linkEntity.metadata;

    const [linkEntityType, leftEntityModel, rightEntityModel] =
      await Promise.all([
        getEntityTypeById(
          { graphApi },
          {
            entityTypeId,
          },
        ),
        EntityModel.getLatest(graphApi, {
          entityId: linkEntity.linkData.leftEntityId,
        }),
        EntityModel.getLatest(graphApi, {
          entityId: linkEntity.linkData.rightEntityId,
        }),
      ]);

    return new LinkEntityModel({
      linkEntity,
      linkEntityType,
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
   * @param params.linkEntityType - the link entity type of the link entity
   * @param params.leftEntityModel - the left entity of the link
   * @param params.leftToRightOrder (optional) - the left to right order of the link entity
   * @param params.rightEntityModel - the right entity of the link
   * @param params.rightToLeftOrder (optional) - the right to left order of the link entity
   * @param params.actorId - the id of the account that is creating the link
   */
  static async createLinkEntity(
    graphApi: GraphApi,
    params: LinkModelCreateParams,
  ): Promise<LinkEntityModel> {
    const {
      ownedById,
      linkEntityType,
      actorId,
      leftEntityModel,
      leftToRightOrder,
      rightEntityModel,
      rightToLeftOrder,
      properties = {},
    } = params;

    if (!isEntityTypeLinkEntityType({ entityType: linkEntityType })) {
      throw new Error(
        `Entity type with ID "${linkEntityType.schema.$id}" is not a link entity type.`,
      );
    }

    const linkData = {
      leftEntityId: leftEntityModel.getBaseId(),
      leftToRightOrder,
      rightEntityId: rightEntityModel.getBaseId(),
      rightToLeftOrder,
    };
    const { data: linkEntityMetadata } = await graphApi.createEntity({
      ownedById,
      linkData,
      actorId,
      entityTypeId: linkEntityType.schema.$id,
      properties,
    });

    return await LinkEntityModel.fromEntity(graphApi, {
      metadata: linkEntityMetadata as EntityMetadata,
      properties,
      linkData,
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
      leftToRightOrder?: number;
      rightToLeftOrder?: number;
      actorId: string;
    },
  ): Promise<EntityModel> {
    const { properties, actorId, leftToRightOrder, rightToLeftOrder } = params;

    const { data: metadata } = await graphApi.updateEntity({
      actorId,
      entityId: this.getBaseId(),
      entityTypeId: this.entityType.schema.$id,
      properties,
      leftToRightOrder,
      rightToLeftOrder,
    });

    return LinkEntityModel.fromEntity(graphApi, {
      metadata: metadata as EntityMetadata,
      properties,
      linkData: {
        leftEntityId: this.entity.linkData!.leftEntityId,
        leftToRightOrder,
        rightEntityId: this.entity.linkData!.rightEntityId,
        rightToLeftOrder,
      },
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
      entityTypeId: this.entityType.schema.$id,
      properties,
      leftToRightOrder: linkOrder.leftToRightOrder,
      rightToLeftOrder: linkOrder.rightToLeftOrder,
    });

    return LinkEntityModel.fromEntity(graphApi, {
      metadata: metadata as EntityMetadata,
      properties,
      linkData: {
        leftEntityId: this.entity.linkData!.leftEntityId,
        leftToRightOrder: linkOrder.leftToRightOrder,
        rightEntityId: this.entity.linkData!.rightEntityId,
        rightToLeftOrder: linkOrder.rightToLeftOrder,
      },
    });
  }
}
