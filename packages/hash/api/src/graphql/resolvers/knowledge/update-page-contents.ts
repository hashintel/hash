// import { JsonObject } from "@blockprotocol/core";

import { ApolloError, UserInputError } from "apollo-server-errors";
import produce from "immer";
import { BlockModel, EntityModel, EntityTypeModel } from "../../../model";
import { exactlyOne } from "../../../util";
import {
  KnowledgeEntity,
  KnowledgeEntityDefinition,
  KnowledgeSwapBlockData,
  KnowledgeUpdateEntity,
  KnowledgeUpdatePageAction,
  KnowledgeUpdatePageContentsResult,
  MutationKnowledgeUpdatePageContentsArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

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
        `at action ${i}: exactly one of insertBlock, moveBlock, removeBlock or updateEntity must be specified`,
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
  { dataSources, user },
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
      if (draft.entityType?.entityTypeVersionedUri) {
        draft.entityType.entityTypeVersionedUri = placeholderResults.get(
          draft.entityType.entityTypeVersionedUri,
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
  for (const { action, i } of actions
    // eslint-disable-next-line @typescript-eslint/no-shadow
    .map((action, i) => ({ action, i }))
    // eslint-disable-next-line @typescript-eslint/no-shadow
    .filter(({ action }) => action.createEntity)) {
    try {
      const {
        entity: entityDefinition,
        accountId: entityAccountId,
        entityPlaceholderId,
      } = action.createEntity!;

      placeholderResults.set(
        entityPlaceholderId,
        await createEntityWithPlaceholders(entityDefinition, entityAccountId),
      );
    } catch (error) {
      if (error instanceof UserInputError) {
        throw new UserInputError(`action ${i}: ${error}`);
      }
      throw new Error(
        `createEntity: Could not create new entity: ${JSON.stringify(error)}`,
      );
    }
  }

  // Create any _new_ blocks
  const insertedBlocks = await Promise.all(
    actions
      .map((action, i) => ({ action, i }))
      .filter(({ action }) => action.insertBlock)
      .map(async ({ action, i }) => {
        try {
          const {
            accountId: blockAccountId,
            componentId: blockComponentId,
            existingBlockEntity,
            blockPlaceholderId,
            entityPlaceholderId,
            entity,
          } = action.insertBlock!;

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
              accountId: user.accountId,
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
            throw new UserInputError(`action ${i}: ${error}`);
          }
          throw new Error(
            `insertBlock: Could not create insert new or existing block: ${JSON.stringify(
              error,
            )}`,
          );
        }
      }),
  );

  // Perform any block data swapping updates.
  await Promise.all(
    actions
      .map(({ swapBlockData }) => swapBlockData)
      .filter(
        (swapBlockData): swapBlockData is KnowledgeSwapBlockData =>
          !!swapBlockData,
      )
      .map(async (swapBlockData) => {
        const block = await BlockModel.getBlockById(graphApi, {
          entityId: swapBlockData.entityId,
        });

        if (!block) {
          throw new Error(
            `Block with entityId ${swapBlockData.entityId} not found`,
          );
        }

        /** @todo: fix with real impl, replace return value. */
        // return await block.swapBlockData(client, {
        //   targetDataAccountId: swapBlockData.newEntityAccountId,
        //   targetDataEntityId: swapBlockData.newEntityEntityId,
        //   updatedByAccountId: user.accountId,
        // });

        return block;
      }),
  );

  // Perform any entity updates.
  await Promise.all(
    actions
      .map(({ updateEntity }) => updateEntity)
      .filter(
        (updateEntity): updateEntity is KnowledgeUpdateEntity => !!updateEntity,
      )
      .map(async (updateEntity) => {
        const entityModel = await EntityModel.getLatest(graphApi, {
          accountId: updateEntity.accountId,
          entityId: updateEntity.entityId,
        });

        return entityModel.updateProperties(graphApi, {
          updatedProperties: Object.entries(updateEntity.properties).map(
            ([key, value]) => ({ propertyTypeBaseUri: key, value }),
          ),
          updatedByAccountId: user.accountId,
        });
      }),
  );

  /** @todo rest of page updating. */
  throw new Error("unimplemented");
};
