import { ApolloServerErrorCode } from "@apollo/server/dist/esm/errors";
import type {
  Entity,
  EntityId,
  PropertyPatchOperation,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import { mergePropertiesAndMetadata } from "@local/hash-graph-sdk/entity";
import { GraphQLError } from "graphql";
import { produce } from "immer";

import type { ImpureGraphContext } from "../../../../graph/context-types";
import type { PropertyValue } from "../../../../graph/knowledge/primitive/entity";
import {
  createEntityWithLinks,
  getLatestEntityById,
  updateEntity,
} from "../../../../graph/knowledge/primitive/entity";
import type { Block } from "../../../../graph/knowledge/system-types/block";
import {
  createBlock,
  getBlockById,
  updateBlockDataEntity,
} from "../../../../graph/knowledge/system-types/block";
import type { User } from "../../../../graph/knowledge/system-types/user";
import type {
  CreateEntityAction,
  EntityDefinition,
  InsertBlockAction,
  SwapBlockDataAction,
  UpdateBlockCollectionAction,
  UpdateEntityAction,
} from "../../../api-types.gen";
import * as Error from "../../../error";

export const createEntityWithPlaceholdersFn =
  (
    authentication: AuthenticationContext,
    context: ImpureGraphContext<false, true>,
    placeholderResults: PlaceholderResultsMap,
  ) =>
  async (originalDefinition: EntityDefinition, webId: WebId) => {
    const entityDefinition = produce(originalDefinition, (draft) => {
      if (draft.existingEntityId) {
        draft.existingEntityId = placeholderResults.get(
          draft.existingEntityId,
        ) as EntityId;
      }
    });

    if (entityDefinition.existingEntityId) {
      try {
        return await getLatestEntityById(context, authentication, {
          entityId: entityDefinition.existingEntityId,
        });
      } catch {
        throw Error.notFound(
          `Entity ${entityDefinition.existingEntityId} not found`,
        );
      }
    } else {
      if (!entityDefinition.entityTypeIds?.[0]) {
        throw Error.badRequest(
          `Must provide at least one entry in entityTypeIds if not providing existingEntityId`,
        );
      }

      return await createEntityWithLinks(context, authentication, {
        webId,
        entityTypeIds: entityDefinition.entityTypeIds as [
          VersionedUrl,
          ...VersionedUrl[],
        ],
        properties: entityDefinition.entityProperties ?? { value: {} },
        linkedEntities: entityDefinition.linkedEntities ?? undefined,
      });
    }
  };

type UpdateBlockCollectionActionKey = keyof UpdateBlockCollectionAction;

/**
 * @optimization instead of iterating the actions list on every call, we can
 *   memoize a hashmap of grouped actions so we only have to pass through the
 *   list once.
 *   Do note that we would likely have very small `actions` lists, so each
 *   iteration is very cheap.
 */
export const filterForAction = <T extends UpdateBlockCollectionActionKey>(
  actions: UpdateBlockCollectionAction[],
  key: T,
): { action: NonNullable<UpdateBlockCollectionAction[T]>; index: number }[] =>
  actions.reduce<
    { action: NonNullable<UpdateBlockCollectionAction[T]>; index: number }[]
  >((acc, current, index) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    if (current != null && key in current) {
      acc.push({ action: current[key]!, index });
    }
    return acc;
  }, []);

const isPlaceholderId = (value: unknown): value is `placeholder-${string}` =>
  typeof value === "string" && value.startsWith("placeholder-");

export class PlaceholderResultsMap {
  private map = new Map<string, EntityId>();

  get(placeholderId: string) {
    if (isPlaceholderId(placeholderId)) {
      const entityId = this.map.get(placeholderId);
      if (!entityId) {
        throw Error.notFound(`Placeholder ${placeholderId} missing`);
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
      entityId,
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
    entityWebId: WebId,
  ) => Promise<Entity>;
}): Promise<void> => {
  try {
    const {
      createEntityAction: {
        entity: entityDefinition,
        webId: entityWebId,
        entityPlaceholderId,
      },
      createEntityWithPlaceholders,
      placeholderResults,
    } = params;
    placeholderResults.set(entityPlaceholderId, {
      entityId: (
        await createEntityWithPlaceholders(entityDefinition, entityWebId)
      ).metadata.recordId.entityId,
    });
  } catch (error) {
    if (
      error instanceof GraphQLError &&
      error.extensions.code === ApolloServerErrorCode.BAD_USER_INPUT
    ) {
      throw Error.badUserInput(`action ${params.index}: ${error}`);
    }

    throw Error.any(
      `createEntity: Could not create new entity: ${JSON.stringify(
        error,
      )}, trying to create ${JSON.stringify(params)}`,
    );
  }
};

/**
 * Insert new block onto block collection.
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
      entityWebId: WebId,
    ) => Promise<Entity>;
    placeholderResults: PlaceholderResultsMap;
  },
): Promise<Block> => {
  try {
    const {
      user,
      insertBlockAction: {
        webId: blockWebId,
        componentId: blockComponentId,
        existingBlockEntityId,
        blockPlaceholderId,
        entityPlaceholderId,
        entity,
      },
      createEntityWithPlaceholders,
      placeholderResults,
    } = params;
    const authentication = { actorId: user.accountId };

    const blockData = await createEntityWithPlaceholders(
      entity,
      // assume that the "block entity" is in the same account as the block itself
      blockWebId,
    );

    placeholderResults.set(entityPlaceholderId, {
      entityId: blockData.metadata.recordId.entityId,
    });

    let block: Block;

    if (existingBlockEntityId) {
      if (blockComponentId) {
        throw Error.badRequest(
          "InsertNewBlock: cannot set component id when using existing block entity",
        );
      }
      const existingBlock = await getBlockById(context, authentication, {
        entityId: existingBlockEntityId,
      });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
      if (!existingBlock) {
        throw Error.notFound("InsertBlock: provided block id does not exist");
      }

      block = existingBlock;
    } else if (blockComponentId) {
      block = await createBlock(context, authentication, {
        blockData,
        webId: blockWebId,
        componentId: blockComponentId,
      });
    } else {
      throw Error.badRequest(
        `InsertBlock: exactly one of existingBlockEntity or componentId must be provided`,
      );
    }

    placeholderResults.set(blockPlaceholderId, {
      entityId: block.entity.metadata.recordId.entityId,
    });

    return block;
  } catch (error) {
    if (
      error instanceof GraphQLError &&
      error.extensions.code === ApolloServerErrorCode.BAD_USER_INPUT
    ) {
      throw Error.badUserInput(`action ${params.index}: ${error}`);
    }

    throw Error.any(
      `insertBlock: Could not insert new or existing block: ${JSON.stringify(
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
  context: ImpureGraphContext<false, true>,
  params: {
    user: User;
    swapBlockDataAction: SwapBlockDataAction;
  },
): Promise<void> => {
  const {
    swapBlockDataAction: { entityId },
    user,
  } = params;
  const authentication = { actorId: user.accountId };

  const block = await getBlockById(context, authentication, {
    entityId,
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
  if (!block) {
    throw Error.notFound(`Block with entityId ${entityId} not found`);
  }

  const { newEntityEntityId } = params.swapBlockDataAction;

  const newBlockDataEntity = await getLatestEntityById(
    context,
    authentication,
    {
      entityId: newEntityEntityId,
    },
  );

  await updateBlockDataEntity(context, authentication, {
    block,
    newBlockDataEntity,
  });
};

/**
 * Update properties of an entity.
 * Acts on {@link UpdateEntityAction}
 */
export const handleUpdateEntity = async (
  context: ImpureGraphContext<false, true>,
  params: {
    user: User;
    action: UpdateEntityAction;
    placeholderResults: PlaceholderResultsMap;
  },
): Promise<void> => {
  const { action, placeholderResults, user } = params;
  const authentication = { actorId: user.accountId };

  // If this entity ID is a placeholder, use that instead.
  let entityId = action.entityId;
  if (placeholderResults.has(entityId)) {
    entityId = placeholderResults.get(entityId) as EntityId;
  }

  const entity = await getLatestEntityById(context, authentication, {
    entityId,
  });

  await updateEntity(context, authentication, {
    entity,
    propertyPatches: typedEntries(action.properties).map(
      ([key, value]) =>
        ({
          op: entity.properties[key] === value ? "replace" : "add",
          path: [key],
          property: mergePropertiesAndMetadata(
            (value ?? undefined) as PropertyValue,
          ),
        }) satisfies PropertyPatchOperation,
    ),
  });
};
