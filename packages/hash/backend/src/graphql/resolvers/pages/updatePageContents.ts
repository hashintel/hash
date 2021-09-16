import { ApolloError, UserInputError } from "apollo-server-errors";

import { DbPageProperties, DbBlockProperties } from "../../../types/dbTypes";
import {
  Resolver,
  MutationUpdatePageContentsArgs,
  UpdatePageAction,
  InsertNewBlock,
  RemoveBlock,
  MoveBlock,
} from "../../apiTypes.gen";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";
import { User } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { DBClient } from "../../../db";
import { exactlyOne } from "../../../util";
import { createEntityArgsBuilder } from "../util";

export const updatePageContents: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageContentsArgs
> = async (_, { accountId, entityId, actions }, { dataSources, user }) => {
  validateActionsInput(actions);

  return await dataSources.db.transaction(async (client) => {
    // Create any new blocks
    const newBlocks = await Promise.all(
      actions
        .map((action, i) => ({ action, i }))
        .filter(({ action }) => action.insertNewBlock)
        .map(({ action, i }) =>
          createBlock(client, action.insertNewBlock!, user).catch((err) => {
            if (err instanceof UserInputError) {
              throw new UserInputError(`action ${i}: ${err}`);
            }
            throw err;
          })
        )
    );

    // Perform any entity updates. Currently, each of these may cause a new page version
    // to be created.
    // @todo: when we move to linking on entityId, instead of entityVersionId, it will
    // be possible to perform these updates concurrently.
    for (const action of actions.filter((action) => action.updateEntity)) {
      await Entity.updateProperties(client)(action.updateEntity!);
    }

    const page = await Entity.getEntityLatestVersion(client)({
      accountId,
      entityId,
    });
    if (!page) {
      const msg = `Page with fixed ID ${entityId} not found in account ${accountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    // Update the page by inserting new blocks, moving blocks and removing blocks
    const pageProperties = page.properties as DbPageProperties;
    let insertCount = 0;
    let propertiesChanged = false;
    for (const [i, action] of actions.entries()) {
      try {
        if (action.insertNewBlock) {
          insertBlock(pageProperties, {
            accountId: newBlocks[insertCount].accountId,
            entityId: newBlocks[insertCount].entityVersionId, // pages currently link on version ID
            position: action.insertNewBlock.position,
          });
          insertCount += 1;
          propertiesChanged = true;
        } else if (action.moveBlock) {
          moveBlock(pageProperties, action.moveBlock);
          propertiesChanged = true;
        } else if (action.removeBlock) {
          removeBlock(pageProperties, action.removeBlock);
          propertiesChanged = true;
        }
      } catch (err) {
        if (err instanceof UserInputError) {
          throw new UserInputError(`action ${i}: ${err}`);
        }
        throw err;
      }
    }
    if (propertiesChanged) {
      await page.updateProperties(client)(pageProperties);
    }

    // Return the new state of the page
    const updatedPage = await Entity.getEntityLatestVersion(client)({
      accountId,
      entityId,
    });
    if (!updatedPage) {
      throw new Error(`could not find entity with fixed id ${entityId}`);
    }
    return updatedPage.toGQLUnknownEntity();
  });
};

const validateActionsInput = (actions: UpdatePageAction[]) => {
  for (const [i, action] of actions.entries()) {
    if (
      !exactlyOne(
        action.insertNewBlock,
        action.moveBlock,
        action.removeBlock,
        action.updateEntity
      )
    ) {
      throw new UserInputError(
        `at action ${i}: exactly one of insertNewBlock, moveBlock, removeBlock or updateEntity must be specified`
      );
    }
  }
};

/** Create a block and a new entity contained inside it. Returns the new block entity. */
const createBlock = async (
  client: DBClient,
  params: InsertNewBlock,
  user: User
) => {
  const childEntity = await Entity.create(client)(
    createEntityArgsBuilder({
      accountId: params.accountId,
      createdById: user.entityId,
      properties: params.entityProperties,
      versioned: params.versioned ?? true,
      entityTypeId: params.entityTypeId,
      entityTypeVersionId: params.entityTypeVersionId,
      systemTypeName: params.systemTypeName,
    })
  );

  // Create the block
  const blockProperties: DbBlockProperties = {
    entityId: childEntity.entityVersionId,
    accountId: params.accountId,
    componentId: params.componentId,
  };
  const newBlock = await Entity.create(client)({
    accountId: params.accountId,
    createdById: user.entityId,
    systemTypeName: "Block",
    versioned: true,
    properties: blockProperties,
  });

  return newBlock;
};

const moveBlock = (properties: DbPageProperties, move: MoveBlock) => {
  const length = properties.contents.length;
  if (move.currentPosition < 0 || move.currentPosition >= length) {
    throw new UserInputError(
      `invalid currentPosition: ${move.currentPosition}`
    );
  }
  if (move.newPosition < 0 || move.newPosition >= length) {
    throw new UserInputError(`invalid newPosition: ${move.newPosition}`);
  }

  const [block] = properties.contents.splice(move.currentPosition, 1);
  properties.contents.splice(move.newPosition, 0, block);
};

const insertBlock = (
  properties: DbPageProperties,
  insert: { accountId: string; entityId: string; position: number }
) => {
  const length = properties.contents.length;
  if (insert.position < 0 || insert.position > length) {
    throw new UserInputError(`invalid position: ${insert.position}`);
  }

  const { accountId, entityId } = insert;
  if (insert.position === length) {
    properties.contents.push({ accountId, entityId });
  } else {
    properties.contents.splice(insert.position, 0, { accountId, entityId });
  }
};

const removeBlock = (properties: DbPageProperties, remove: RemoveBlock) => {
  const length = properties.contents.length;
  if (remove.position < 0 || remove.position >= length) {
    throw new UserInputError(`invalid position: ${remove.position}`);
  }
  properties.contents.splice(remove.position, 1);
};
