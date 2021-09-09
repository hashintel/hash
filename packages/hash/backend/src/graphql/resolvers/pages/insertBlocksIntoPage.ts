import { ApolloError, UserInputError } from "apollo-server-errors";

import { DbPageProperties, DbBlockProperties } from "../../../types/dbTypes";
import { Resolver, MutationInsertBlocksIntoPageArgs } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { genId } from "../../../util";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";

export const insertBlocksIntoPage: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
  MutationInsertBlocksIntoPageArgs
> = async (
  _,
  { accountId, pageMetadataId, blocks, previousBlockId },
  { dataSources }
) => {
  return await dataSources.db.transaction(async (client) => {
    // Create the blocks
    const newBlocks = await Promise.all(
      blocks.map(async (block) => {
        const { entityTypeId, entityTypeVersionId, systemTypeName } = block;
        if (!entityTypeId && !entityTypeVersionId && !systemTypeName) {
          throw new UserInputError(
            "One of entityTypeId, entityTypeVersionId, or systemTypeName must be provided"
          );
        }

        // Create the entity that the block contains
        const childEntity = await Entity.create(client)({
          accountId: block.accountId,
          createdById: genId(), // @todo
          entityTypeId: entityTypeId ?? undefined,
          entityTypeVersionId: entityTypeVersionId || undefined,
          systemTypeName: systemTypeName || undefined,
          properties: block.entityProperties,
          versioned: true, // @todo: this should be a property of the type
        });

        // Create the block
        const blockProperties: DbBlockProperties = {
          entityId: childEntity.entityVersionId,
          accountId: block.accountId,
          componentId: block.componentId,
        };
        const newBlock = await Entity.create(client)({
          accountId: block.accountId,
          createdById: genId(), // @todo
          systemTypeName: "Block",
          versioned: true,
          properties: blockProperties,
        });
        return newBlock;
      })
    );

    // Insert the blocks into the page
    // @todo: always get the latest version for now. This is a temporary measure.
    // return here when strict vs. optimistic entity mutation question is resolved.
    const page = await Entity.getEntityLatestVersion(client)({
      accountId,
      entityId: pageMetadataId,
    });
    if (!page) {
      const msg = `Page ${pageMetadataId} not found in account ${accountId}`;
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
        entityId: blk.entityVersionId,
      }))
    );

    // Update the page
    await page.updateProperties(client)(page.properties);

    // @todo: for now, all entities are non-versioned, so the array only has a single
    // element. Return when versioned entities are implemented at the API layer.
    return page.toGQLUnknownEntity();
  });
};

const findBlockInPage = (blockId: string, props: DbPageProperties) => {
  const i = props.contents.findIndex((blk) => blk.entityId === blockId);
  if (i === -1) {
    throw new UserInputError(`block ${blockId} not found in page`);
  }
  return i;
};
