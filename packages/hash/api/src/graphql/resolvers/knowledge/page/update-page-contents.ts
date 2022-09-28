import { ApolloError, UserInputError } from "apollo-server-errors";
import produce from "immer";
import { GraphApi } from "@hashintel/hash-graph-client";

import {
  BlockModel,
  EntityModel,
  PageModel,
  UserModel,
} from "../../../../model";
import { exactlyOne } from "../../../../util";
import {
  CreateKnowledgeEntityAction,
  KnowledgeEntityDefinition,
  InsertKnowledgeBlockAction,
  SwapKnowledgeBlockDataAction,
  UpdateKnowledgeEntityAction,
  UpdateKnowledgePageAction,
  UpdateKnowledgePageContentsResult,
  MutationUpdateKnowledgePageContentsArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { pageModelToGQL, UnresolvedPageGQL } from "../model-mapping";

type UpdatePageActionKey = keyof UpdateKnowledgePageAction;

const filterForAction = <T extends UpdatePageActionKey>(
  actions: UpdateKnowledgePageAction[],
  key: T,
): { action: NonNullable<UpdateKnowledgePageAction[T]>; index: number }[] =>
  actions.reduce<
    { action: NonNullable<UpdateKnowledgePageAction[T]>; index: number }[]
  >((acc, current, index) => {
    if (current != null && key in current) {
      acc.push({ action: current[key]!, index });
    }
    return acc;
  }, []);

const validateActionsInput = (actions: UpdateKnowledgePageAction[]) => {
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
};

const isPlaceholderId = (value: unknown): value is `placeholder-${string}` =>
  typeof value === "string" && value.startsWith("placeholder-");

class PlaceholderResultsMap {
  private map = new Map<string, string>();

  get(placeholderId: string) {
    if (isPlaceholderId(placeholderId)) {
      const entityId = this.map.get(placeholderId);
      if (!entityId) {
        throw new Error(`Placeholder ${placeholderId} missing`);
      }
      return entityId;
    }
    return placeholderId;
  }

  has(placeholderId: string): boolean {
    return this.map.has(placeholderId);
  }

  set(placeholderId: string | null | undefined, entity: { entityId: string }) {
    if (isPlaceholderId(placeholderId)) {
      this.map.set(placeholderId, entity.entityId);
    }
  }

  getResults() {
    return Array.from(this.map.entries()).map(([placeholderId, entityId]) => ({
      placeholderId,
      entityId,
    }));
  }
}

/**
 * Create new entity.
 * Acts on {@link CreateKnowledgeEntityAction}
 */
const handleCreateNewEntity = async (params: {
  createEntityAction: CreateKnowledgeEntityAction;
  index: number;
  placeholderResults: PlaceholderResultsMap;
  createEntityWithPlaceholders: (
    originalDefinition: KnowledgeEntityDefinition,
    entityCreatedById: string,
  ) => Promise<EntityModel>;
}): Promise<void> => {
  try {
    const {
      createEntityAction: {
        entity: entityDefinition,
        ownedById: entityOwnedById,
        entityPlaceholderId,
      },
      createEntityWithPlaceholders,
      placeholderResults,
    } = params;
    placeholderResults.set(
      entityPlaceholderId,
      await createEntityWithPlaceholders(entityDefinition, entityOwnedById),
    );
  } catch (error) {
    if (error instanceof UserInputError) {
      throw new UserInputError(`action ${params.index}: ${error}`);
    }
    throw new Error(
      `createEntity: Could not create new entity: ${JSON.stringify(error)}`,
    );
  }
};

/**
 * Insert new block onto page.
 * Acts on {@link InsertKnowledgeBlockAction}
 */
const handleInsertNewBlock = async (
  graphApi: GraphApi,
  params: {
    userModel: UserModel;
    insertBlockAction: InsertKnowledgeBlockAction;
    index: number;
    createEntityWithPlaceholders: (
      originalDefinition: KnowledgeEntityDefinition,
      entityCreatedById: string,
    ) => Promise<EntityModel>;
    placeholderResults: PlaceholderResultsMap;
  },
): Promise<BlockModel> => {
  try {
    const {
      userModel,
      insertBlockAction: {
        ownedById: blockOwnedById,
        componentId: blockComponentId,
        existingBlockEntity,
        blockPlaceholderId,
        entityPlaceholderId,
        entity,
      },
      createEntityWithPlaceholders,
      placeholderResults,
    } = params;

    const blockData = await createEntityWithPlaceholders(
      entity,
      // assume that the "block entity" is in the same account as the block itself
      blockOwnedById,
    );

    placeholderResults.set(entityPlaceholderId, blockData);

    let block: BlockModel;

    if (existingBlockEntity) {
      if (blockComponentId) {
        throw new Error(
          "InsertNewBlock: cannot set component id when using existing block entity",
        );
      }
      const existingBlock = await BlockModel.getBlockById(
        graphApi,
        existingBlockEntity,
      );

      if (!existingBlock) {
        throw new Error("InsertBlock: provided block id does not exist");
      }

      block = existingBlock;
    } else if (blockComponentId) {
      block = await BlockModel.createBlock(graphApi, {
        blockData,
        accountId: userModel.accountId,
        componentId: blockComponentId,
      });
    } else {
      throw new Error(
        `InsertBlock: exactly one of existingBlockEntity or componentId must be provided`,
      );
    }

    placeholderResults.set(blockPlaceholderId, block);

    return block;
  } catch (error) {
    if (error instanceof UserInputError) {
      throw new UserInputError(`action ${params.index}: ${error}`);
    }
    throw new Error(
      `insertBlock: Could not create insert new or existing block: ${JSON.stringify(
        error,
      )}`,
    );
  }
};

/**
 * Swap a block's data entity to another entity.
 * Acts on {@link SwapKnowledgeBlockDataAction}
 */
const handleSwapBlockData = async (
  graphApi: GraphApi,
  params: {
    userModel: UserModel;
    swapBlockDataAction: SwapKnowledgeBlockDataAction;
  },
): Promise<void> => {
  const {
    userModel,
    swapBlockDataAction: { entityId },
  } = params;

  const block = await BlockModel.getBlockById(graphApi, {
    entityId,
  });

  if (!block) {
    throw new Error(`Block with entityId ${entityId} not found`);
  }

  const { newEntityOwnedById, newEntityEntityId } = params.swapBlockDataAction;

  const newBlockDataEntity = await EntityModel.getLatest(graphApi, {
    entityId: newEntityEntityId,
    accountId: newEntityOwnedById,
  });

  await block.updateBlockDataEntity(graphApi, {
    updatedById: userModel.accountId,
    newBlockDataEntity,
  });
};

/**
 * Update properties of an entity.
 * Acts on {@link UpdateKnowledgeEntityAction}
 */
const handleUpdateEntity = async (
  graphApi: GraphApi,
  params: {
    userModel: UserModel;
    action: UpdateKnowledgeEntityAction;
    placeholderResults: PlaceholderResultsMap;
  },
): Promise<void> => {
  const { userModel, action, placeholderResults } = params;

  // If this entity ID is a placeholder, use that instead.
  let entityId = action.entityId;
  if (placeholderResults.has(entityId)) {
    entityId = placeholderResults.get(entityId);
  }

  const entityModel = await EntityModel.getLatest(graphApi, {
    accountId: action.ownedById,
    entityId,
  });

  await entityModel.updateProperties(graphApi, {
    updatedProperties: Object.entries(action.properties).map(
      ([key, value]) => ({ propertyTypeBaseUri: key, value }),
    ),
    updatedByAccountId: userModel.accountId,
  });
};

export const updateKnowledgePageContents: ResolverFn<
  Promise<
    Omit<UpdateKnowledgePageContentsResult, "page"> & {
      page: UnresolvedPageGQL;
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
  validateActionsInput(actions);
  const placeholderResults = new PlaceholderResultsMap();

  const { graphApi } = dataSources;

  const createEntityWithPlaceholders = async (
    originalDefinition: KnowledgeEntityDefinition,
    entityCreatedById: string,
  ) => {
    const entityDefinition = produce(originalDefinition, (draft) => {
      if (draft.existingEntity) {
        draft.existingEntity.entityId = placeholderResults.get(
          draft.existingEntity.entityId,
        );
      }
      if (draft.entityType?.entityTypeId) {
        draft.entityType.entityTypeId = placeholderResults.get(
          draft.entityType.entityTypeId,
        );
      }

      /**
       * @todo Figure out what would be the equivalent to linked data in the new graph api.
       *   Related to https://app.asana.com/0/1200211978612931/1201850801682936/f
       *   Asana ticket: https://app.asana.com/0/1202805690238892/1203045933021781/f
       */
      // if (draft.entityProperties?.text?.__linkedData?.entityId) {
      //   draft.entityProperties.text.__linkedData.entityId =
      //     placeholderResults.get(
      //       draft.entityProperties.text.__linkedData.entityId,
      //     );
      // }
    });

    return await EntityModel.createEntityWithLinks(graphApi, {
      createdById: entityCreatedById,
      entityDefinition,
    });
  };

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
    page: pageModelToGQL(pageModel),
    placeholders: placeholderResults.getResults(),
  };
};
