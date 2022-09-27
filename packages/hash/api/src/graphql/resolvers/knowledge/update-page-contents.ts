// import { JsonObject } from "@blockprotocol/core";

import { UserInputError } from "apollo-server-errors";
import produce from "immer";
import { GraphApi } from "@hashintel/hash-graph-client";

import {
  BlockModel,
  EntityModel,
  EntityTypeModel,
  UserModel,
} from "../../../model";
import { exactlyOne } from "../../../util";
import {
  KnowledgeCreateEntityAction,
  KnowledgeEntity,
  KnowledgeEntityDefinition,
  KnowledgeInsertBlockAction,
  KnowledgeSwapBlockDataAction,
  KnowledgeUpdateEntityAction,
  KnowledgeUpdatePageAction,
  KnowledgeUpdatePageContentsResult,
  MutationKnowledgeUpdatePageContentsArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

type UpdatePageActionKey = keyof KnowledgeUpdatePageAction;

const filterForAction = <T extends UpdatePageActionKey>(
  actions: KnowledgeUpdatePageAction[],
  key: T,
): { action: NonNullable<KnowledgeUpdatePageAction[T]>; index: number }[] =>
  actions.reduce<
    { action: NonNullable<KnowledgeUpdatePageAction[T]>; index: number }[]
  >((acc, current, index) => {
    if (current != null && key in current) {
      acc.push({ action: current[key]!, index });
    }
    return acc;
  }, []);

const validateActionsInput = (actions: KnowledgeUpdatePageAction[]) => {
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
        `at action ${i}: exactly one of the fields on KnowledgeUpdatePageAction must be specified`,
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
 * Acts on {@link KnowledgeCreateEntityAction}
 */
const createNewEntity = async (params: {
  createEntityAction: KnowledgeCreateEntityAction;
  index: number;
  placeholderResults: PlaceholderResultsMap;
  createEntityWithPlaceholders: (
    originalDefinition: KnowledgeEntityDefinition,
    entityAccountId: string,
  ) => Promise<EntityModel>;
}): Promise<void> => {
  try {
    const {
      createEntityAction: {
        entity: entityDefinition,
        accountId: entityAccountId,
        entityPlaceholderId,
      },
      createEntityWithPlaceholders,
      placeholderResults,
    } = params;
    placeholderResults.set(
      entityPlaceholderId,
      await createEntityWithPlaceholders(entityDefinition, entityAccountId),
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
 * Acts on {@link KnowledgeInsertBlockAction}
 */
const insertNewBlock = async (
  graphApi: GraphApi,
  params: {
    userModel: UserModel;
    insertBlockAction: KnowledgeInsertBlockAction;
    index: number;
    createEntityWithPlaceholders: (
      originalDefinition: KnowledgeEntityDefinition,
      entityAccountId: string,
    ) => Promise<EntityModel>;
    placeholderResults: PlaceholderResultsMap;
  },
): Promise<BlockModel> => {
  try {
    const {
      userModel,
      insertBlockAction: {
        accountId: blockAccountId,
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
      blockAccountId,
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
 * Acts on {@link KnowledgeSwapBlockDataAction}
 */
const swapBlockData = async (
  graphApi: GraphApi,
  params: {
    userModel: UserModel;
    swapBlockDataAction: KnowledgeSwapBlockDataAction;
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

  const { newEntityAccountId, newEntityEntityId } = params.swapBlockDataAction;

  const newBlockDataEntity = await EntityModel.getLatest(graphApi, {
    entityId: newEntityEntityId,
    accountId: newEntityAccountId,
  });

  await block.updateBlockDataEntity(graphApi, {
    updatedById: userModel.accountId,
    newBlockDataEntity,
  });
};

/**
 * Update properties of an entity.
 * Acts on {@link KnowledgeUpdateEntityAction}
 */
const updateEntity = async (
  graphApi: GraphApi,
  params: {
    userModel: UserModel;
    action: KnowledgeUpdateEntityAction;
  },
): Promise<void> => {
  const { action, userModel } = params;
  const entityModel = await EntityModel.getLatest(graphApi, {
    accountId: action.accountId,
    entityId: action.entityId,
  });

  await entityModel.updateProperties(graphApi, {
    updatedProperties: Object.entries(action.properties).map(
      ([key, value]) => ({ propertyTypeBaseUri: key, value }),
    ),
    updatedByAccountId: userModel.accountId,
  });
};

export const knowledgeUpdatePageContents: ResolverFn<
  Promise<
    {
      page: KnowledgeEntity;
    } & Omit<KnowledgeUpdatePageContentsResult, "page">
  >,
  {},
  LoggedInGraphQLContext,
  MutationKnowledgeUpdatePageContentsArgs
> = async (
  _,
  { accountId, entityId: pageEntityId, actions },
  { dataSources, user: userModel },
) => {
  validateActionsInput(actions);
  const placeholderResults = new PlaceholderResultsMap();

  const { graphApi } = dataSources;

  const createEntityWithPlaceholders = async (
    originalDefinition: KnowledgeEntityDefinition,
    entityAccountId: string,
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

      // /**
      //  * @todo remove this when legacy links are removed
      //  */
      // if (draft.entityProperties?.text?.__linkedData?.entityId) {
      //   draft.entityProperties.text.__linkedData.entityId =
      //     placeholderResults.get(
      //       draft.entityProperties.text.__linkedData.entityId,
      //     );
      // }
    });

    return await EntityModel.createEntityWithLinks(graphApi, {
      createdById: entityAccountId,
      entityDefinition,
    });
  };

  /** @todo */
  // Create any _new_ entity types

  /**
   * Create any _new_ entities. This is done one at a time in order to allow
   * you to reference a previous created entity using its placeholder.
   */
  for (const { action, index } of filterForAction(actions, "createEntity")) {
    await createNewEntity({
      createEntityAction: action,
      index,
      placeholderResults,
      createEntityWithPlaceholders,
    });
  }

  // Create any _new_ blocks
  const _insertBlockActions = Promise.all(
    filterForAction(actions, "insertBlock").map(({ action, index }) =>
      insertNewBlock(graphApi, {
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
      swapBlockData(graphApi, {
        userModel,
        swapBlockDataAction: action,
      }),
    ),
  );

  // Perform any entity updates.
  await Promise.all(
    filterForAction(actions, "updateEntity").map(async ({ action }) =>
      updateEntity(graphApi, { userModel, action }),
    ),
  );

  /** @todo rest of page updating. */
  throw new Error("unimplemented");
};
