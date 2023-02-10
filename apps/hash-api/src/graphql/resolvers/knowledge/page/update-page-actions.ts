import { VersionedUri } from "@blockprotocol/type-system";
import {
  AccountId,
  EntityId,
  OwnedById,
} from "@local/hash-graphql-shared/types";
import { Entity } from "@local/hash-subgraph";
import { UserInputError } from "apollo-server-errors";
import produce from "immer";

import { ImpureGraphContext } from "../../../../graph";
import {
  createEntityWithLinks,
  getLatestEntityById,
  getOrCreateEntity,
  PropertyValue,
  updateEntityProperties,
} from "../../../../graph/knowledge/primitive/entity";
import {
  Block,
  createBlock,
  getBlockById,
  updateBlockDataEntity,
} from "../../../../graph/knowledge/system-types/block";
import { User } from "../../../../graph/knowledge/system-types/user";
import {
  CreateEntityAction,
  EntityDefinition,
  InsertBlockAction,
  SwapBlockDataAction,
  UpdateEntityAction,
  UpdatePageAction,
} from "../../../api-types.gen";

export const createEntityWithPlaceholdersFn =
  (context: ImpureGraphContext, placeholderResults: PlaceholderResultsMap) =>
  async (originalDefinition: EntityDefinition, entityActorId: AccountId) => {
    const entityDefinition = produce(originalDefinition, (draft) => {
      if (draft.existingEntityId) {
        draft.existingEntityId = placeholderResults.get(
          draft.existingEntityId,
        ) as EntityId;
      }
      if (draft.entityTypeId) {
        draft.entityTypeId = placeholderResults.get(
          draft.entityTypeId,
        ) as VersionedUri;
      }
    });

    if (entityDefinition.existingEntityId) {
      return await getOrCreateEntity(context, {
        ownedById: entityActorId as OwnedById,
        // We've looked up the placeholder ID, and have an actual entity ID at this point.
        entityDefinition,
        actorId: entityActorId,
      });
    } else {
      return await createEntityWithLinks(context, {
        ownedById: entityActorId as OwnedById,
        entityTypeId: entityDefinition.entityTypeId!,
        properties: entityDefinition.entityProperties ?? {},
        linkedEntities: entityDefinition.linkedEntities ?? undefined,
        actorId: entityActorId,
      });
    }
  };

type UpdatePageActionKey = keyof UpdatePageAction;

/**
 * @optimization instead of iterating the actions list on every call, we can
 *   memoize a hashmap of grouped actions so we only have to pass through the
 *   list once.
 *   Do note that we would likely have very small `actions` lists, so each
 *   iteration is very cheap.
 */
export const filterForAction = <T extends UpdatePageActionKey>(
  actions: UpdatePageAction[],
  key: T,
): { action: NonNullable<UpdatePageAction[T]>; index: number }[] =>
  actions.reduce<{ action: NonNullable<UpdatePageAction[T]>; index: number }[]>(
    (acc, current, index) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
      if (current != null && key in current) {
        acc.push({ action: current[key]!, index });
      }
      return acc;
    },
    [],
  );

const isPlaceholderId = (value: unknown): value is `placeholder-${string}` =>
  typeof value === "string" && value.startsWith("placeholder-");

export class PlaceholderResultsMap {
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

  set(
    placeholderId: string | null | undefined,
    entity: { entityId: EntityId },
  ) {
    if (isPlaceholderId(placeholderId)) {
      this.map.set(placeholderId, entity.entityId);
    }
  }

  getResults() {
    return Array.from(this.map.entries()).map(([placeholderId, entityId]) => ({
      placeholderId,
      // All resulting values should be entityIds at this point.
      entityId: entityId as EntityId,
    }));
  }
}

/**
 * Create new entity.
 * Acts on {@link CreateEntityAction}
 */
export const handleCreateNewEntity = async (params: {
  createEntityAction: CreateEntityAction;
  index: number;
  placeholderResults: PlaceholderResultsMap;
  createEntityWithPlaceholders: (
    originalDefinition: EntityDefinition,
    entityActorId: AccountId,
  ) => Promise<Entity>;
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
    placeholderResults.set(entityPlaceholderId, {
      entityId: (
        await createEntityWithPlaceholders(entityDefinition, entityOwnedById)
      ).metadata.recordId.entityId as EntityId,
    });
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
 * Acts on {@link InsertBlockAction}
 */
export const handleInsertNewBlock = async (
  context: ImpureGraphContext,
  params: {
    user: User;
    insertBlockAction: InsertBlockAction;
    index: number;
    createEntityWithPlaceholders: (
      originalDefinition: EntityDefinition,
      entityActorId: AccountId,
    ) => Promise<Entity>;
    placeholderResults: PlaceholderResultsMap;
  },
): Promise<Block> => {
  try {
    const {
      user,
      insertBlockAction: {
        ownedById: blockOwnedById,
        componentId: blockComponentId,
        existingBlockEntityId,
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

    placeholderResults.set(entityPlaceholderId, {
      entityId: blockData.metadata.recordId.entityId as EntityId,
    });

    let block: Block;

    if (existingBlockEntityId) {
      if (blockComponentId) {
        throw new Error(
          "InsertNewBlock: cannot set component id when using existing block entity",
        );
      }
      const existingBlock = await getBlockById(context, {
        entityId: existingBlockEntityId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
      if (!existingBlock) {
        throw new Error("InsertBlock: provided block id does not exist");
      }

      block = existingBlock;
    } else if (blockComponentId) {
      block = await createBlock(context, {
        blockData,
        ownedById: user.accountId as OwnedById,
        componentId: blockComponentId,
        actorId: user.accountId,
      });
    } else {
      throw new Error(
        `InsertBlock: exactly one of existingBlockEntity or componentId must be provided`,
      );
    }

    placeholderResults.set(blockPlaceholderId, {
      entityId: block.entity.metadata.recordId.entityId as EntityId,
    });

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
 * Acts on {@link SwapBlockDataAction}
 */
export const handleSwapBlockData = async (
  context: ImpureGraphContext,
  params: {
    user: User;
    swapBlockDataAction: SwapBlockDataAction;
  },
): Promise<void> => {
  const {
    swapBlockDataAction: { entityId },
    user,
  } = params;

  const block = await getBlockById(context, {
    entityId,
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  if (!block) {
    throw new Error(`Block with entityId ${entityId} not found`);
  }

  const { newEntityEntityId } = params.swapBlockDataAction;

  const newBlockDataEntity = await getLatestEntityById(context, {
    entityId: newEntityEntityId,
  });

  await updateBlockDataEntity(context, {
    block,
    newBlockDataEntity,
    actorId: user.accountId,
  });
};

/**
 * Update properties of an entity.
 * Acts on {@link UpdateEntityAction}
 */
export const handleUpdateEntity = async (
  context: ImpureGraphContext,
  params: {
    user: User;
    action: UpdateEntityAction;
    placeholderResults: PlaceholderResultsMap;
  },
): Promise<void> => {
  const { action, placeholderResults, user } = params;

  // If this entity ID is a placeholder, use that instead.
  let entityId = action.entityId;
  if (placeholderResults.has(entityId)) {
    entityId = placeholderResults.get(entityId) as EntityId;
  }

  const entity = await getLatestEntityById(context, {
    entityId,
  });

  await updateEntityProperties(context, {
    entity,
    updatedProperties: Object.entries(action.properties).map(
      ([key, value]) => ({
        propertyTypeBaseUri: key,
        value: (value ?? undefined) as PropertyValue,
      }),
    ),
    actorId: user.accountId,
  });
};
