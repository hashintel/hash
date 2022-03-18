import {
  Entity,
  EntityConstructorArgs,
  Block,
  User,
  EntityExternalResolvers,
  UnresolvedGQLEntityType,
} from ".";
import { DbClient } from "../db";
import { DbBlockProperties, EntityType } from "../db/adapter";
import { SystemTypeName, Block as GQLBlock } from "../graphql/apiTypes.gen";

export type BlockExternalResolvers = EntityExternalResolvers | "data"; // entity resolved in `src/graphql/resolvers/block/linkedEntities.ts`

export type UnresolvedGQLBlock = Omit<GQLBlock, BlockExternalResolvers> & {
  entityType: UnresolvedGQLEntityType;
};

export type BlockConstructorArgs = {
  properties: DbBlockProperties;
  outgoingEntityIds?: string[];
} & EntityConstructorArgs;

class __Block extends Entity {
  properties: DbBlockProperties;

  parentEntityId?: string;

  constructor(args: BlockConstructorArgs) {
    super(args);
    this.properties = args.properties;
    this.parentEntityId = args.outgoingEntityIds?.[0] ?? undefined;
  }

  static async getEntityType(client: DbClient): Promise<EntityType> {
    const blockEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "Block",
    });
    return blockEntityType;
  }

  static async createBlock(
    client: DbClient,
    params: {
      accountId?: string;
      properties: DbBlockProperties;
      createdBy: User;
      blockData: Entity;
    },
  ): Promise<Block> {
    const { blockData, properties, createdBy, accountId } = params;

    const entity = await Entity.createEntityWithLinks(client, {
      user: createdBy,
      accountId: accountId ?? createdBy.accountId,
      entityDefinition: {
        entityProperties: properties,
        entityType: {
          systemTypeName: SystemTypeName.Block,
        },
        linkedEntities: [
          {
            path: "$.data",
            destinationAccountId: blockData.accountId,
            entity: {
              existingEntity: blockData,
            },
          },
        ],
      },
    });

    return new Block({ ...entity, properties });
  }

  static async fromEntity(client: DbClient, entity: Entity): Promise<Block> {
    if (
      entity.entityType.entityId !==
      (await Block.getEntityType(client)).entityId
    ) {
      throw new Error(
        `Entity with entityId ${entity.entityId} does not have the Block system type as its entity type`,
      );
    }
    return new Block({
      ...entity,
      properties: entity.properties as DbBlockProperties,
    });
  }

  static async getBlockById(
    client: DbClient,
    params: { accountId: string; entityId: string },
  ): Promise<Block | null> {
    const { accountId, entityId } = params;
    const dbBlock = await client.getEntityLatestVersion({
      accountId,
      entityId,
    });

    /** @todo: check whether the returned entity has the correct entity type */

    return dbBlock ? new Block(dbBlock) : null;
  }

  async getBlockData(client: DbClient): Promise<Entity> {
    const blockDataLinks = await this.getOutgoingLinks(client, {
      path: ["data"],
    });

    const [firstLink, ...otherLinks] = blockDataLinks;

    if (!firstLink) {
      throw new Error(
        `Critical: block with entityId ${this.entityId} in account with accountId ${this.accountId} has no linked block data entity`,
      );
    }
    if (otherLinks.length > 0) {
      throw new Error(
        `Critical: block with entityId ${this.entityId} in account with accountId ${this.accountId} has more than one linked block data entity`,
      );
    }

    return firstLink.getDestination(client);
  }
}

export default __Block;
