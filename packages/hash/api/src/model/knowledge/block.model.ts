import { GraphApi } from "@hashintel/hash-graph-client";
import { EntityId, PropertyObject } from "@hashintel/hash-subgraph";
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
  "properties" | "entityType"
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
      entityModel.entityType.schema.$id !==
      SYSTEM_TYPES.entityType.block.schema.$id
    ) {
      throw new EntityTypeMismatchError(
        entityModel.getBaseId(),
        SYSTEM_TYPES.entityType.block.schema.$id,
        entityModel.entityType.schema.$id,
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
    params: { entityId: EntityId },
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
      [SYSTEM_TYPES.propertyType.componentId.metadata.editionId.baseId]:
        componentId,
    };

    const entityType = SYSTEM_TYPES.entityType.block;

    const entity = await EntityModel.create(graphApi, {
      ownedById,
      properties,
      entityType,
      actorId,
    });

    await entity.createOutgoingLink(graphApi, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.blockData,
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
      SYSTEM_TYPES.propertyType.componentId.metadata.editionId.baseId
    ];
  }

  /**
   * Get the linked block data entity of the block.
   */
  async getBlockData(graphApi: GraphApi): Promise<EntityModel> {
    const outgoingBlockDataLinks = await this.getOutgoingLinks(graphApi, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.blockData,
    });

    const outgoingBlockDataLink = outgoingBlockDataLinks[0];

    if (!outgoingBlockDataLink) {
      throw new Error(
        `Block with entityId ${this.getBaseId()} does not have an outgoing blockData link`,
      );
    }

    return outgoingBlockDataLink.rightEntityModel;
  }

  async getBlockComments(graphApi: GraphApi): Promise<CommentModel[]> {
    const blockCommentLinks = await this.getIncomingLinks(graphApi, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.parent,
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
      linkEntityType: SYSTEM_TYPES.linkEntityType.blockData,
    });

    const outgoingBlockDataLink = outgoingBlockDataLinks[0];

    if (!outgoingBlockDataLink) {
      throw new Error(
        `Block with entityId ${this.getBaseId()} does not have an outgoing block data link`,
      );
    }

    if (
      outgoingBlockDataLink.rightEntityModel.getBaseId() ===
      newBlockDataEntity.getBaseId()
    ) {
      throw new Error(
        `The block with entity id ${this.getBaseId()} already has a linked block data entity with entity id ${newBlockDataEntity.getBaseId()}`,
      );
    }

    await outgoingBlockDataLink.archive(graphApi, { actorId });

    await this.createOutgoingLink(graphApi, {
      linkEntityType: SYSTEM_TYPES.linkEntityType.blockData,
      rightEntityModel: newBlockDataEntity,
      ownedById: this.getOwnedById(),
      actorId,
    });
  }
}
