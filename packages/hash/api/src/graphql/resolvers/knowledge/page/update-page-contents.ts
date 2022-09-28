import { ApolloError, UserInputError } from "apollo-server-errors";

import { exactlyOne } from "../../../../util";
import { PageModel } from "../../../../model";
import {
  UpdateKnowledgePageContentsResult,
  MutationUpdateKnowledgePageContentsArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import {
  mapPageModelToGQL,
  UnresolvedKnowledgePageGQL,
} from "../model-mapping";
import {
  PlaceholderResultsMap,
  filterForAction,
  handleCreateNewEntity,
  handleInsertNewBlock,
  handleSwapBlockData,
  handleUpdateEntity,
  createEntityWithPlaceholdersFn,
} from "./update-page-actions";

export const updateKnowledgePageContents: ResolverFn<
  Promise<
    Omit<UpdateKnowledgePageContentsResult, "page"> & {
      page: UnresolvedKnowledgePageGQL;
    }
  >,
  {},
  LoggedInGraphQLContext,
  MutationUpdateKnowledgePageContentsArgs
> = async (
  _,
  { ownedById, entityId: pageEntityId, actions },
  { dataSources, user: userModel },
) => {
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
        `at action ${i}: exactly one of the fields on UpdateKnowledgePageAction must be specified`,
      );
    }
  }

  const placeholderResults = new PlaceholderResultsMap();
  const { graphApi } = dataSources;

  const createEntityWithPlaceholders = createEntityWithPlaceholdersFn(
    graphApi,
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
      handleInsertNewBlock(graphApi, {
        userModel,
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
      handleSwapBlockData(graphApi, {
        userModel,
        swapBlockDataAction: action,
      }),
    ),
  );

  // Perform any entity updates.
  await Promise.all(
    filterForAction(actions, "updateEntity").map(async ({ action }) =>
      handleUpdateEntity(graphApi, { userModel, action, placeholderResults }),
    ),
  );

  // @todo, perhaps check this exists first?
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId: pageEntityId,
  });

  if (!pageModel) {
    const msg = `Page with fixed ID ${pageEntityId} not found in account ${ownedById}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  let insertCount = 0;
  for (const [i, action] of actions.entries()) {
    try {
      if (action.insertBlock) {
        await pageModel.insertBlock(graphApi, {
          block: insertedBlocks[insertCount]!,
          position: action.insertBlock.position,
          insertedById: userModel.accountId,
        });
        insertCount += 1;
      } else if (action.moveBlock) {
        await pageModel.moveBlock(graphApi, {
          ...action.moveBlock,
          movedById: userModel.accountId,
        });
      } else if (action.removeBlock) {
        await pageModel.removeBlock(graphApi, {
          ...action.removeBlock,
          removedById: userModel.accountId,
          allowRemovingFinal: actions
            .slice(i + 1)
            .some((actionToFollow) => actionToFollow.insertBlock),
        });
      }
    } catch (error) {
      if (error instanceof UserInputError) {
        throw new UserInputError(`action ${i}: ${error}`);
      }
      throw new Error(`Could not apply update: ${JSON.stringify(error)}`);
    }
  }

  return {
    page: mapPageModelToGQL(pageModel),
    placeholders: placeholderResults.getResults(),
  };
};
