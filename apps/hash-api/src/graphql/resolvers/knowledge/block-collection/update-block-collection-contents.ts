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

  try {
    const [insertedBlocks, blockCollectionEntity] = await Promise.all([
      Promise.all(
        filterForAction(actions, "insertBlock").map(({ action, index }) =>
          // Create any _new_ blocks
          handleInsertNewBlock(context, {
            user,
            insertBlockAction: action,
            index,
            createEntityWithPlaceholders,
            placeholderResults,
          }),
        ),
      ),
      getLatestEntityById(context, authentication, {
        entityId: blockCollectionEntityId,
      }),
      // Perform any block data swapping updates.
      ...filterForAction(actions, "swapBlockData").map(({ action }) =>
        handleSwapBlockData(context, {
          user,
          swapBlockDataAction: action,
        }),
      ),
      // Perform any entity updates.
      ...filterForAction(actions, "updateEntity").map(async ({ action }) =>
        handleUpdateEntity(context, { user, action, placeholderResults }),
      ),
      ...filterForAction(actions, "moveBlock").map(({ action }) =>
        moveBlockInBlockCollection(context, authentication, {
          position: action.position,
          linkEntityId: action.linkEntityId,
        }),
      ),
      ...filterForAction(actions, "removeBlock").map(({ action }) =>
        removeBlockFromBlockCollection(context, authentication, {
          linkEntityId: action.linkEntityId,
        }),
      ),
    ]);

    await Promise.all(
      filterForAction(actions, "insertBlock").map(({ action }, index) =>
        addBlockToBlockCollection(context, authentication, {
          blockCollectionEntityId,
          block: insertedBlocks[index]!,
          position: action.position,
        }),
      ),
    );

    return {
      blockCollection: blockCollectionEntity,
      placeholders: placeholderResults.getResults(),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Could not apply update: ${error.message}`);
    }

    throw new Error(`Could not apply update: ${JSON.stringify(error)}`);
  }
};
