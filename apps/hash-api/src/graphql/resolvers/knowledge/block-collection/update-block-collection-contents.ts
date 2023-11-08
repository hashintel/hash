import { Entity } from "@local/hash-subgraph";
import { ApolloError, UserInputError } from "apollo-server-errors";

import { getLatestEntityById } from "../../../../graph/knowledge/primitive/entity";
import {
  addBlockToBlockCollection,
  moveBlockInBlockCollection,
  removeBlockFromBlockCollection,
} from "../../../../graph/knowledge/system-types/block-collection";
import { exactlyOne } from "../../../../util";
import {
  MutationUpdateBlockCollectionContentsArgs,
  ResolverFn,
  UpdateBlockCollectionContentsResult,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import {
  createEntityWithPlaceholdersFn,
  filterForAction,
  handleCreateNewEntity,
  handleInsertNewBlock,
  handleSwapBlockData,
  handleUpdateEntity,
  PlaceholderResultsMap,
} from "./update-block-collection-actions";

/**
 * @todo This operation should ideally be atomic in nature, either we do all
 *   updates or none. currently there is no guarantee that a failure rolls back
 *   all changes, which could leave the database in an undesired state.
 *   When we have a transaction primitive in the Graph API, we should use it here.
 *   See https://app.asana.com/0/1200211978612931/1202573572594586/f
 */
export const updateBlockCollectionContents: ResolverFn<
  Promise<
    Omit<UpdateBlockCollectionContentsResult, "blockCollection"> & {
      blockCollection: Entity;
    }
  >,
  {},
  LoggedInGraphQLContext,
  MutationUpdateBlockCollectionContentsArgs
> = async (
  _,
  { entityId: blockCollectionEntityId, actions },
  { dataSources, authentication, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  for (const [i, action] of actions.entries()) {
    if (
      !exactlyOne(
        action.insertBlock,
        action.moveBlock,
        action.removeBlock,
        action.updateEntity,
        action.swapBlockData,
        action.createEntity,
      )
    ) {
      throw new UserInputError(
        `at action ${i}: exactly one of the fields on UpdateBlockCollectionAction must be specified`,
      );
    }
  }

  const placeholderResults = new PlaceholderResultsMap();

  const createEntityWithPlaceholders = createEntityWithPlaceholdersFn(
    authentication,
    context,
    placeholderResults,
  );

  /**
   * Create any _new_ entities. This is done one at a time in order to allow
   * you to reference a previous created entity using its placeholder.
   */
  for (const { action, index } of filterForAction(actions, "createEntity")) {
    await handleCreateNewEntity({
      createEntityAction: action,
      index,
      placeholderResults,
      createEntityWithPlaceholders,
    });
  }

  // Create any _new_ blocks
  const insertedBlocks = await Promise.all(
    filterForAction(actions, "insertBlock").map(({ action, index }) =>
      handleInsertNewBlock(context, {
        user,
        insertBlockAction: action,
        index,
        createEntityWithPlaceholders,
        placeholderResults,
      }),
    ),
  );

  // Perform any block data swapping updates.
  await Promise.all(
    filterForAction(actions, "swapBlockData").map(({ action }) =>
      handleSwapBlockData(context, {
        user,
        swapBlockDataAction: action,
      }),
    ),
  );

  // Perform any entity updates.
  await Promise.all(
    filterForAction(actions, "updateEntity").map(async ({ action }) =>
      handleUpdateEntity(context, { user, action, placeholderResults }),
    ),
  );

  const blockCollectionEntity = await getLatestEntityById(
    context,
    authentication,
    {
      entityId: blockCollectionEntityId,
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  if (!blockCollectionEntity) {
    const msg = `BlockCollection with Entity ID ${blockCollectionEntityId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  let insertCount = 0;
  for (const [i, action] of actions.entries()) {
    try {
      if (action.insertBlock) {
        await addBlockToBlockCollection(context, authentication, {
          blockCollectionEntity,
          block: insertedBlocks[insertCount]!,
          position: action.insertBlock.position,
        });
        insertCount += 1;
      } else if (action.moveBlock) {
        await moveBlockInBlockCollection(context, authentication, {
          position: action.moveBlock.position,
          linkEntityId: action.moveBlock.linkEntityId,
        });
      } else if (action.removeBlock) {
        await removeBlockFromBlockCollection(context, authentication, {
          linkEntityId: action.removeBlock.linkEntityId,
        });
      }
    } catch (error) {
      if (error instanceof UserInputError) {
        throw new UserInputError(`action ${i}: ${error}`);
      } else if (error instanceof Error) {
        throw new Error(`Could not apply update: ${error.message}`);
      }

      throw new Error(`Could not apply update: ${JSON.stringify(error)}`);
    }
  }

  return {
    blockCollection: blockCollectionEntity,
    placeholders: placeholderResults.getResults(),
  };
};
