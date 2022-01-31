import { ApolloError, UserInputError } from "apollo-server-errors";

import {
  Resolver,
  MutationUpdatePageContentsArgs,
  UpdatePageAction,
  InsertNewBlock,
  RemoveBlock,
  MoveBlock,
} from "../../apiTypes.gen";
import { Entity, UnresolvedGQLEntity, User } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { DBClient } from "../../../db";
import { exactlyOne } from "../../../util";
import { DbBlockProperties, DbPageProperties } from "../../../db/adapter";

const validateActionsInput = (actions: UpdatePageAction[]) => {
  for (const [i, action] of actions.entries()) {
    if (
      !exactlyOne(
        action.insertNewBlock,
        action.moveBlock,
        action.removeBlock,
        action.updateEntity,
      )
    ) {
      throw new UserInputError(
        `at action ${i}: exactly one of insertNewBlock, moveBlock, removeBlock or updateEntity must be specified`,
      );
    }
  }
};

/** Create a block and a new entity contained inside it. Returns the new block entity. */
const createBlock = async (
  client: DBClient,
  { accountId, componentId, entity: entityDefinition }: InsertNewBlock,
  user: User,
) => {
  const entity = await Entity.createEntityWithLinks(client, {
    accountId,
    user,
    entityDefinition,
  });

  // Create the block
  const blockProperties: DbBlockProperties = {
    componentId,
    entityId: entity.entityId,
    accountId,
  };

  const newBlock = await Entity.create(client, {
    accountId,
    systemTypeName: "Block",
    createdByAccountId: user.accountId,
    properties: blockProperties,
    versioned: true,
  });

  return newBlock;
};

const moveBlock = (properties: DbPageProperties, move: MoveBlock) => {
  const length = properties.contents.length;
  if (move.currentPosition < 0 || move.currentPosition >= length) {
    throw new UserInputError(
      `invalid currentPosition: ${move.currentPosition}`,
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
  insert: { accountId: string; entityId: string; position: number },
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

export const updatePageContents: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageContentsArgs
> = async (_, { accountId, entityId, actions }, { dataSources, user }) => {
  validateActionsInput(actions);

  return await dataSources.db.transaction(async (client) => {
    // Create any _new_ blocks
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
          }),
        ),
    );

    // Perform any entity updates.
    await Promise.all(
      actions
        .filter((action) => action.updateEntity)
        .map((action) => {
          // Populate the update entity action with the current user id before using it
          return {
            ...action.updateEntity!,
            updatedByAccountId: user.accountId,
          };
        })
        .map((populatedAction) =>
          Entity.updateProperties(client, populatedAction),
        ),
    );

    // Lock the page so that no other concurrent call to this resolver will conflict
    // with the page update.
    await Entity.acquireLock(client, { entityId });

    const page = await Entity.getEntityLatestVersion(client, {
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
            entityId: newBlocks[insertCount].entityId,
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
      await page.updateEntityProperties(client, {
        properties: pageProperties,
        updatedByAccountId: user.accountId,
      });
    }

    // Return the new state of the page
    const updatedPage = await Entity.getEntityLatestVersion(client, {
      accountId,
      entityId,
    });
    if (!updatedPage) {
      throw new Error(`could not find entity with fixed id ${entityId}`);
    }
    return updatedPage.toGQLUnknownEntity();
  });
};
