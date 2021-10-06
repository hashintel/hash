import { ApolloError, UserInputError } from "apollo-server-errors";

import { DbPageProperties, DbBlockProperties } from "../../../types/dbTypes";
import { Resolver, MutationInsertBlocksIntoPageArgs } from "../../apiTypes.gen";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { createEntityArgsBuilder } from "../util";

const findBlockInPage = (blockId: string, props: DbPageProperties) => {
  const i = props.contents.findIndex((blk) => blk.entityId === blockId);
  if (i === -1) {
    throw new UserInputError(`block ${blockId} not found in page`);
  }
  return i;
};

export const insertBlocksIntoPage: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationInsertBlocksIntoPageArgs
> = async (
  _,
  { accountId, entityId, blocks, previousBlockId },
  { dataSources, user }
) => {
  return await dataSources.db.transaction(async (client) => {
    // Create the blocks
    const newBlocks = await Promise.all(
      blocks.map(async (block) => {
        const { entityTypeId, entityTypeVersionId, systemTypeName } = block;

        // Create the entity that the block contains
        const newEntity = await Entity.create(client)(
          createEntityArgsBuilder({
            accountId: block.accountId,
            createdById: user.entityId,
            properties: block.entityProperties,
            versioned: true, // @todo: this should be a property of the type
            entityTypeId,
            entityTypeVersionId,
            systemTypeName,
          })
        );

        // Create the block
        const blockProperties: DbBlockProperties = {
          entityId: newEntity.entityId,
          accountId: newEntity.accountId,
          componentId: block.componentId,
        };
        const newBlock = await Entity.create(client)({
          accountId: block.accountId,
          createdById: user.entityId,
          systemTypeName: "Block",
          versioned: true,
          properties: blockProperties,
        });
        return newBlock;
      })
    );

    // Insert the blocks into the page
    const page = await Entity.getEntityLatestVersion(client)({
      accountId,
      entityId,
    });
    if (!page) {
      const msg = `Page with fixed ID ${entityId} not found in account ${accountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    /** @todo: stop casting page.properties type */
    const pos = previousBlockId
      ? findBlockInPage(previousBlockId, page.properties as DbPageProperties) +
        1
      : 0;
    (page.properties as DbPageProperties).contents.splice(
      pos,
      0,
      ...newBlocks.map((blk) => ({
        type: "Block",
        accountId: blk.accountId,
        entityId: blk.entityId,
      }))
    );

    // Update the page
    await page.updateProperties(client)(page.properties);

    // @todo: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return page.toGQLUnknownEntity();
  });
};
