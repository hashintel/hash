import { ApolloError, UserInputError } from "apollo-server-errors";

import {
  addBlockToPage,
  getPageById,
  moveBlockInPage,
  removeBlockFromPage,
} from "../../../../graph/knowledge/system-types/page";
import { exactlyOne } from "../../../../util";
import {
  MutationUpdatePageContentsArgs,
  ResolverFn,
  UpdatePageContentsResult,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { mapPageToGQL, UnresolvedPageGQL } from "../graphql-mapping";
import {
  createEntityWithPlaceholdersFn,
  filterForAction,
  handleCreateNewEntity,
  handleInsertNewBlock,
  handleSwapBlockData,
  handleUpdateEntity,
  PlaceholderResultsMap,
} from "./update-page-actions";

/**
 * @todo This operation should ideally be atomic in nature, either we do all
 *   updates or none. currently there is no guarantee that a failure rolls back
 *   all changes, which could leave the database in an undesired state.
 *   When we have a transaction primitive in the Graph API, we should use it here.
 *   See https://app.asana.com/0/1200211978612931/1202573572594586/f
 */
export const updatePageContents: ResolverFn<
  Promise<
    Omit<UpdatePageContentsResult, "page"> & {
      page: UnresolvedPageGQL;
    }
  >,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageContentsArgs
> = async (_, { entityId: pageEntityId, actions }, { dataSources, user }) => {
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
        action.createEntityType,
      )
    ) {
      throw new UserInputError(
        `at action ${i}: exactly one of the fields on UpdatePageAction must be specified`,
      );
    }
  }

  const placeholderResults = new PlaceholderResultsMap();

  const createEntityWithPlaceholders = createEntityWithPlaceholdersFn(
    context,
    placeholderResults,
  );

  /**
   * @todo Figure out how we want to implement entity type creation
   *   in update-page-contents
   *   see https://app.asana.com/0/1202805690238892/1203057486837598/f
   */
  // Create any _new_ entity types
  filterForAction(actions, "createEntityType").map(({ index }) => {
    throw new Error(
      `createEntityType: not implemented yet, action index: ${index}`,
    );
  });

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

  const page = await getPageById(context, {
    entityId: pageEntityId,
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  if (!page) {
    const msg = `Page with Entity ID ${pageEntityId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  let insertCount = 0;
  for (const [i, action] of actions.entries()) {
    try {
      if (action.insertBlock) {
        await addBlockToPage(context, {
          page,
          block: insertedBlocks[insertCount]!,
          position: action.insertBlock.position,
          actorId: user.accountId,
        });
        insertCount += 1;
      } else if (action.moveBlock) {
        await moveBlockInPage(context, {
          ...action.moveBlock,
          page,
          actorId: user.accountId,
        });
      } else if (action.removeBlock) {
        await removeBlockFromPage(context, {
          page,
          position: action.removeBlock.position,
          actorId: user.accountId,
          allowRemovingFinal: actions
            .slice(i + 1)
            .some((actionToFollow) => actionToFollow.insertBlock),
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
    page: mapPageToGQL(page),
    placeholders: placeholderResults.getResults(),
  };
};
