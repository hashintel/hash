import { GraphApi } from "@hashintel/hash-graph-client";
import { EntityModel, BlockModel, EntityModelCreateParams } from "..";
import { WORKSPACE_TYPES } from "../../graph/workspace-types";
import { workspaceAccountId } from "../util";

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
    const entity = await EntityModel.getLatest(graphApi, {
      // assumption: `accountId` of block is always the workspace account id
      accountId: workspaceAccountId,
      entityId: params.entityId,
    });

    return BlockModel.fromEntityModel(entity);
  }

  /**
   * Get a workspace block entity by its component id.
   *
   * @param params.componentId - the component id
   */
  static async getBlockByComponentId(
    graphApi: GraphApi,
    params: { componentId: string },
  ): Promise<BlockModel | null> {
    /**
     * @todo: use upcoming Graph API method to filter entities in the datastore
     *   https://app.asana.com/0/1202805690238892/1202890614880643/f
     */
    const allEntities = await EntityModel.getAllLatest(graphApi, {
      accountId: workspaceAccountId,
    });

    const matchingBlock = allEntities
      .filter(
        ({ entityTypeModel }) =>
          entityTypeModel.schema.$id ===
          WORKSPACE_TYPES.entityType.block.schema.$id,
      )
      .map((entityModel) => new BlockModel(entityModel))
      .find((block) => block.getComponentId() === params.componentId);

    return matchingBlock ?? null;
  }

  /**
   * Create a workspace block entity.
   *
   * @param params.componentId - the component id of the block
   */
  static async createBlock(
    graphApi: GraphApi,
    params: BlockModelCreateParams,
  ): Promise<BlockModel> {
    const { componentId, blockData, accountId } = params;

    const properties: object = {
      [WORKSPACE_TYPES.propertyType.componentId.baseUri]: componentId,
    };

    const entityTypeModel = WORKSPACE_TYPES.entityType.block;

    const entity = await EntityModel.create(graphApi, {
      accountId,
      properties,
      entityTypeModel,
    });

    await entity.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.blockData,
      targetEntityModel: blockData,
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
    const outgoingBlockDataLinks = await this.getOutgoingLink(graphApi, {
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
   * @param params.updatedByAccountId - the account id of the user that updated the
   * @param params.newBlockDataEntity - the new block data entity
   */
  async updateBlockDataEntity(
    graphApi: GraphApi,
    params: {
      /** @todo: rename this argument to something that doesn't include `accountId` */
      updatedByAccountId: string;
      newBlockDataEntity: EntityModel;
    },
  ): Promise<void> {
    const { updatedByAccountId, newBlockDataEntity } = params;
    const outgoingBlockDataLinks = await this.getOutgoingLink(graphApi, {
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
      removedBy: updatedByAccountId,
    });

    await this.createOutgoingLink(graphApi, {
      linkTypeModel: WORKSPACE_TYPES.linkType.blockData,
      targetEntityModel: newBlockDataEntity,
    });
  }
}
