import {
  DbPage,
  DbPageProperties,
  DbBlockProperties,
  DbBlock,
} from "../../../types/dbTypes";
import {
  Resolver,
  MutationInsertBlocksIntoPageArgs,
  Visibility,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { genId } from "../../../util";
import { ApolloError, UserInputError } from "apollo-server-errors";

export const insertBlocksIntoPage: Resolver<
  Promise<DbPage>,
  {},
  GraphQLContext,
  MutationInsertBlocksIntoPageArgs
> = async (
  _,
  { accountId, pageMetadataId, blocks, previousBlockId },
  { dataSources }
) => {
  return await dataSources.db.transaction(async (client): Promise<DbPage> => {
    // Create the blocks
    const newBlocks: DbBlock[] = await Promise.all(
      blocks.map(async (block) => {
        // Create the entity that the block contains
        const childEntity = await client.createEntity({
          accountId: block.accountId,
          createdById: genId(), // @todo
          type: block.entityType,
          properties: block.entityProperties,
          versioned: true, // @todo: this should be a property of the type
        });

        // Create the block
        const blockProperties: DbBlockProperties = {
          entityId: childEntity.entityVersionId,
          accountId: block.accountId,
          entityType: block.entityType,
          componentId: block.componentId,
        };
        const newBlock = await client.createEntity({
          accountId: block.accountId,
          createdById: genId(), // @todo
          type: "Block",
          versioned: true,
          properties: blockProperties,
        });
        return {
          id: newBlock.entityVersionId,
          accountId: newBlock.accountId,
          visibility: Visibility.Public, // @todo: get from entity metadata
          type: newBlock.type,
          properties: blockProperties,
          createdAt: newBlock.createdAt,
          updatedAt: newBlock.updatedAt,
          createdById: newBlock.createdById,
          metadataId: newBlock.metadataId,
        };
      })
    );

    // Insert the blocks into the page
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const page = await client.getLatestEntityVersion({
      accountId,
      metadataId: pageMetadataId,
    });
    if (!page) {
      const msg = `Page ${pageMetadataId} not found in account ${accountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }
    const pos = previousBlockId
      ? findBlockInPage(previousBlockId, page.properties) + 1
      : 0;
    page.properties.contents.splice(
      pos,
      0,
      ...newBlocks.map((blk) => ({
        type: "Block",
        accountId: blk.accountId,
        entityId: blk.id,
      }))
    );

    // Update the page
    const updatedEntities = await client.updateEntity(page);

    // @todo: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    const entity = updatedEntities[0];
    return {
      type: "Page",
      id: entity.entityVersionId,
      accountId: entity.accountId,
      createdById: entity.createdById,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      metadataId: entity.metadataId,
      visibility: Visibility.Public, // @todo: get from entity metadata
      properties: entity.properties as DbPageProperties,
    };
  });
};

const findBlockInPage = (blockId: string, props: DbPageProperties) => {
  const i = props.contents.findIndex((blk) => blk.entityId === blockId);
  if (i === -1) {
    throw new UserInputError(`block ${blockId} not found in page`);
  }
  return i;
};
