import { ApolloError, UserInputError } from "apollo-server-errors";

import {
  Resolver,
  MutationUpdatePageContentsArgs,
  UpdatePageAction,
  UpdateEntity,
} from "../../apiTypes.gen";
import { Block, Entity, Page, UnresolvedGQLEntity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { exactlyOne } from "../../../util";

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

export const updatePageContents: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageContentsArgs
> = async (_, { accountId, entityId, actions }, { dataSources, user }) => {
  validateActionsInput(actions);

  return await dataSources.db.transaction(async (client) => {
    // Create any _new_ blocks
    const newBlocks: Block[] = [];

    /** @todo: find way to concurrently create blocks with outgoing links */
    for (const [i, action] of actions.entries()) {
      if (action.insertNewBlock) {
        try {
          const {
            accountId: blockAccountId,
            componentId: blockComponentId,
            entity: blockDataDefinition,
          } = action.insertNewBlock;

          const blockData = await Entity.createEntityWithLinks(client, {
            accountId: blockAccountId, // assume that the "block entity" is in the same account as the block itself
            user,
            entityDefinition: blockDataDefinition,
          });

          const block = await Block.createBlock(client, {
            blockData,
            createdBy: user,
            accountId: user.accountId,
            properties: {
              componentId: blockComponentId,
            },
          });

          newBlocks.push(block);
        } catch (error) {
          if (error instanceof UserInputError) {
            throw new UserInputError(`action ${i}: ${error}`);
          }
          throw error;
        }
      }
    }

    // Perform any entity updates.
    await Promise.all(
      actions
        .map(({ updateEntity }) => updateEntity)
        .filter((updateEntity): updateEntity is UpdateEntity => !!updateEntity)
        .map(async (updateEntity) =>
          Entity.updateProperties(client, {
            ...updateEntity,
            updatedByAccountId: user.accountId,
          }),
        ),
    );

    // Lock the page so that no other concurrent call to this resolver will conflict
    // with the page update.
    await Entity.acquireLock(client, { entityId });

    const page = await Page.getPageById(client, {
      accountId,
      entityId,
    });
    if (!page) {
      const msg = `Page with fixed ID ${entityId} not found in account ${accountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    // Update the page by inserting new blocks, moving blocks and removing blocks
    let insertCount = 0;
    for (const [i, action] of actions.entries()) {
      try {
        if (action.insertNewBlock) {
          await page.insertBlock(client, {
            block: newBlocks[insertCount],
            position: action.insertNewBlock.position,
            insertedByAccountId: user.accountId,
          });
          insertCount += 1;
        } else if (action.moveBlock) {
          await page.moveBlock(client, {
            ...action.moveBlock,
            movedByAccountId: user.accountId,
          });
        } else if (action.removeBlock) {
          await page.removeBlock(client, {
            ...action.removeBlock,
            removedByAccountId: user.accountId,
          });
        }
      } catch (err) {
        if (err instanceof UserInputError) {
          throw new UserInputError(`action ${i}: ${err}`);
        }
        throw err;
      }
    }

    return page.toGQLUnknownEntity();
  });
};
