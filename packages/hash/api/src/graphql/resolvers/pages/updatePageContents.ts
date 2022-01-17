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
import { Entity, EntityType, UnresolvedGQLEntity, User } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { DBClient } from "../../../db";
import { exactlyOne } from "../../../util";
import { createEntityArgsBuilder } from "../util";

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

/**
 * @todo this assumption of the slug might be brittle,
 */
const capitalizeComponentName = (cId: string) => {
  let componentId = cId;

  // If there's a trailing slash, remove it
  const indexLastSlash = componentId.lastIndexOf("/");
  if (indexLastSlash === componentId.length - 1) {
    componentId = componentId.slice(0, -1);
  }

  //                      *
  // "https://example.org/value"
  const indexAfterLastSlash = componentId.lastIndexOf("/") + 1;
  return (
    //                      * and uppercase it
    // "https://example.org/value"
    componentId.charAt(indexAfterLastSlash).toUpperCase() +
    //                       ****
    // "https://example.org/value"
    componentId.substring(indexAfterLastSlash + 1)
  );
};

/** Create a block and a new entity contained inside it. Returns the new block entity. */
const createBlock = async (
  client: DBClient,
  params: InsertNewBlock,
  user: User,
) => {
  const {
    componentId,
    entityId,
    entityProperties,
    entityTypeId,
    systemTypeName,
    accountId,
    versioned,
  } = params;

  let entity;
  let entityTypeVersionId = params.entityTypeVersionId;

  if (entityId) {
    // Use existing entityId
    entity = await Entity.getEntityLatestVersion(client, {
      accountId,
      entityId,
    });
    if (!entity) {
      throw new ApolloError(`entity ${entityId} not found`, "NOT_FOUND");
    }
  } else if (entityProperties) {
    if (!entityTypeId && !entityTypeVersionId && !systemTypeName) {
      // If type ID doesn't exist, we check the componentId

      let entityTypeWithComponentId =
        await EntityType.getEntityTypeByComponentId(client, {
          componentId,
        });

      // In case the entityType doesn't exist, create one with the appropriate component ID and name
      if (!entityTypeWithComponentId) {
        const systemAccountId = await client.getSystemAccountId();

        const name = capitalizeComponentName(componentId);
        entityTypeWithComponentId = await EntityType.create(client, {
          accountId: systemAccountId,
          createdByAccountId: user.accountId,
          name,
          schema: { componentId },
        });
      }

      entityTypeVersionId = entityTypeWithComponentId.entityVersionId;
    }

    // @todo: if we generate the entity IDs up-front, the entity and the block may
    // be created concurrently.

    // Create new entity since entityId has not been given.
    entity = await Entity.create(
      client,
      createEntityArgsBuilder({
        accountId,
        createdByAccountId: user.accountId,
        entityTypeId,
        entityTypeVersionId,
        systemTypeName,
        properties: entityProperties,
        versioned: versioned ?? true,
      }),
    );
  } else {
    throw new Error(
      `One of entityId OR entityProperties and entityType must be provided`,
    );
  }

  // Create the block
  const blockProperties: DbBlockProperties = {
    componentId,
    entityId: entity.entityId,
    accountId: params.accountId,
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
