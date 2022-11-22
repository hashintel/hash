import { GraphApi } from "@hashintel/hash-graph-client";
import { PropertyObject } from "@hashintel/hash-subgraph";
import {
  EntityModel,
  BlockModel,
  EntityModelCreateParams,
  CommentModel,
} from "..";
import { SYSTEM_TYPES } from "../../graph/system-types";
import { EntityTypeMismatchError } from "../../lib/error";

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
  static fromEntityModel(entityModel: EntityModel): BlockModel {
    if (
      entityModel.entityTypeModel.schema.$id !==
      SYSTEM_TYPES.entityType.block.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entityModel.baseId,
        SYSTEM_TYPES.entityType.block.schema.$id,
        entityModel.entityTypeModel.schema.$id,
      );
    }

    return new BlockModel(entityModel);
  }

  /**
   * Get a system block entity by its entity id.
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
   * Create a system block entity.
   *
   * @param params.componentId - the component id of the block
   * @param params.blockData - the linked block data entity
   * @see {@link EntityModel.create} for remaining params
   */
  static async createBlock(
    graphApi: GraphApi,
    params: BlockModelCreateParams,
  ): Promise<BlockModel> {
    const { componentId, blockData, ownedById, actorId } = params;

    const properties: PropertyObject = {
      [SYSTEM_TYPES.propertyType.componentId.baseUri]: componentId,
    };

    const entityTypeModel = SYSTEM_TYPES.entityType.block;

    const entity = await EntityModel.create(graphApi, {
      ownedById,
      properties,
      entityTypeModel,
      actorId,
    });

    await entity.createOutgoingLink(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.blockData,
      rightEntityModel: blockData,
      ownedById,
      actorId,
    });

    return BlockModel.fromEntityModel(entity);
  }

  /**
   * Get the component id of the block.
   */
  getComponentId(): string {
    return (this.getProperties() as any)[
      SYSTEM_TYPES.propertyType.componentId.baseUri
    ];
  }

  /**
   * Get the linked block data entity of the block.
   */
  async getBlockData(graphApi: GraphApi): Promise<EntityModel> {
    const outgoingBlockDataLinks = await this.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.blockData,
    });

    const outgoingBlockDataLink = outgoingBlockDataLinks[0];

    if (!outgoingBlockDataLink) {
      throw new Error(
        `Block with entityId ${this.baseId} does not have an outgoing blockData link`,
      );
    }

    return outgoingBlockDataLink.rightEntityModel;
  }

  async getBlockComments(graphApi: GraphApi): Promise<CommentModel[]> {
    const blockCommentLinks = await this.getIncomingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.parent,
    });

    const comments = blockCommentLinks.map((link) =>
      CommentModel.fromEntityModel(link.leftEntityModel),
    );

    return comments;
  }

  /**
   * Update the linked block data entity of a block.
   *
   * @param params.newBlockDataEntity - the new block data entity
   * @param params.actorId - the id of the account that is updating the block data entity
   */
  async updateBlockDataEntity(
    graphApi: GraphApi,
    params: {
      newBlockDataEntity: EntityModel;
      actorId: string;
    },
  ): Promise<void> {
    const { newBlockDataEntity, actorId } = params;
    const outgoingBlockDataLinks = await this.getOutgoingLinks(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.blockData,
    });

    const outgoingBlockDataLink = outgoingBlockDataLinks[0];

    if (!outgoingBlockDataLink) {
      throw new Error(
        `Block with entityId ${this.baseId} does not have an outgoing block data link`,
      );
    }

    if (
      outgoingBlockDataLink.rightEntityModel.baseId ===
      newBlockDataEntity.baseId
    ) {
      throw new Error(
        `The block with entity id ${this.baseId} already has a linked block data entity with entity id ${newBlockDataEntity.baseId}`,
      );
    }

    await outgoingBlockDataLink.archive(graphApi, { actorId });

    await this.createOutgoingLink(graphApi, {
      linkEntityTypeModel: SYSTEM_TYPES.linkEntityType.blockData,
      rightEntityModel: newBlockDataEntity,
      ownedById: this.getOwnedById(),
      actorId,
    });
  }
}
