import { GraphApi } from "@hashintel/hash-graph-client";
import { EntityModel, BlockModel, EntityModelCreateParams } from "..";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";

type BlockModelCreateParams = Omit<
  EntityModelCreateParams,
  "properties" | "entityTypeModel"
> & {
  componentId: string;
  blockData: EntityModel;
};

/**
 * @class {@link BlockModel}
 */
export default class extends EntityModel {
  static fromEntityModel(entity: EntityModel): BlockModel {
    if (
      entity.entityTypeModel.schema.$id !==
      WORKSPACE_TYPES.entityType.block.schema.$id
    ) {
      throw new Error(
        `Entity with id ${entity.entityId} is not a workspace block`,
      );
    }

    return new BlockModel(entity);
  }

  /**
   * Get a workspace block entity by its entity id.
   *
   * @param params.entityId - the entity id of the block
   */
  static async getBlockById(
    graphApi: GraphApi,
    params: { entityId: string },
  ): Promise<BlockModel> {
    const entity = await EntityModel.getLatest(graphApi, params);

    return BlockModel.fromEntityModel(entity);
  }

  /**
   * Create a workspace block entity.
   *
   * @param params.componentId - the component id of the block
   * @param params.blockData - the linked block data entity
   * @see {@link EntityModel.create} for remaining params
   */
  static async createBlock(
    graphApi: GraphApi,
    params: BlockModelCreateParams,
  ): Promise<BlockModel> {
    const { componentId, blockData, ownedById } = params;

    const properties: object = {
      [WORKSPACE_TYPES.propertyType.componentId.baseUri]: componentId,
    };

    const entityTypeModel = WORKSPACE_TYPES.entityType.block;

    const entity = await EntityModel.create(graphApi, {
      ownedById,
      properties,
      entityTypeModel,
    });

    await entity.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.blockData,
      targetEntityModel: blockData,
      ownedById,
    });

    return BlockModel.fromEntityModel(entity);
  }

  /**
   * Get the component id of the block.
   */
  getComponentId(): string {
    return (this.properties as any)[
      WORKSPACE_TYPES.propertyType.componentId.baseUri
    ];
  }

  /**
   * Get the linked block data entity of the block.
   */
  async getBlockData(graphApi: GraphApi): Promise<EntityModel> {
    const outgoingBlockDataLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.blockData,
    });

    const outgoingBlockDataLink = outgoingBlockDataLinks[0];

    if (!outgoingBlockDataLink) {
      throw new Error(
        `Block with entityId ${this.entityId} does not have an outgoing blockData link`,
      );
    }

    return outgoingBlockDataLink.targetEntityModel;
  }

  /**
   * Update the linked block data entity of a block.
   *
   * @param params.newBlockDataEntity - the new block data entity
   */
  async updateBlockDataEntity(
    graphApi: GraphApi,
    params: {
      newBlockDataEntity: EntityModel;
    },
  ): Promise<void> {
    const { newBlockDataEntity } = params;
    const outgoingBlockDataLinks = await this.getOutgoingLinks(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.blockData,
    });

    const outgoingBlockDataLink = outgoingBlockDataLinks[0];

    if (!outgoingBlockDataLink) {
      throw new Error(
        `Block with entityId ${this.entityId} does not have an outgoing block data link`,
      );
    }

    if (
      outgoingBlockDataLink.targetEntityModel.entityId ===
      newBlockDataEntity.entityId
    ) {
      throw new Error(
        `The block with entity id ${this.entityId} already has a linked block data entity with entity id ${newBlockDataEntity.entityId}`,
      );
    }

    await outgoingBlockDataLink.remove(graphApi, {
      /**
       * @todo: don't assume the owner of the link is the user that's responsible for removing it.
       * Related to https://app.asana.com/0/1200211978612931/1202848989198291/f
       */
      removedById: this.ownedById,
    });

    await this.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.blockData,
      targetEntityModel: newBlockDataEntity,
      ownedById: this.ownedById,
    });
  }
}
