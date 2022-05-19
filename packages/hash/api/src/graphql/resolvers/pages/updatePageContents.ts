import { ApolloError, UserInputError } from "apollo-server-errors";
import { produce } from "immer";
import {
  Block,
  Entity,
  EntityType,
  Page,
  UnresolvedGQLEntity,
} from "../../../model";
import { exactlyOne } from "../../../util";
import {
  MutationUpdatePageContentsArgs,
  Resolver,
  SwapBlockData,
  UpdateEntity,
  UpdatePageAction,
  UpdatePageContentsResult,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

const validateActionsInput = (actions: UpdatePageAction[]) => {
  for (const [i, action] of actions.entries()) {
    if (
      !exactlyOne(
        action.insertNewBlock,
        action.moveBlock,
        action.removeBlock,
        action.updateEntity,
        action.swapBlockData,
        action.createEntity,
        action.createEntityType,
      )
    ) {
      throw new UserInputError(
        `at action ${i}: exactly one of insertNewBlock, moveBlock, removeBlock or updateEntity must be specified`,
      );
    }
  }
};

// @todo these actions need to be processed in order to ensure placeholders work as expected
export const updatePageContents: Resolver<
  Promise<
    {
      page: UnresolvedGQLEntity;
    } & Omit<UpdatePageContentsResult, "page">
  >,
  {},
  LoggedInGraphQLContext,
  MutationUpdatePageContentsArgs
> = async (_, { accountId, entityId, actions }, { dataSources, user }) => {
  validateActionsInput(actions);

  /**
   * Some actions allow you to put in placeholder entityIds which refer to
   * previous entities created during this mutation. These must always start
   * with "placeholder-".
   */
  const placeholderResults = new Map<string, string>();

  const getRealId = (id: string) => {
    if (id.startsWith("placeholder-")) {
      const realId = placeholderResults.get(id);
      if (!realId) {
        throw new Error(`Real id for placeholder ${id} missing`);
      }
      return realId;
    }
  };

  return await dataSources.db.transaction(async (client) => {
    // Create any _new_ entity types
    await Promise.all(
      actions
        .map((action, i) => ({ action, i }))
        .filter(({ action }) => action.createEntityType)
        .map(async ({ action, i }) => {
          try {
            const {
              placeholderID,
              description,
              name,
              schema,
              accountId: entityTypeAccountId,
            } = action.createEntityType!;

            const entityType = await EntityType.create(client, {
              accountId: entityTypeAccountId,
              createdByAccountId: user.accountId,
              description: description ?? undefined,
              name,
              schema,
            });

            if (placeholderID?.startsWith("placeholder-")) {
              placeholderResults.set(placeholderID, entityType.entityId);
            }
          } catch (error) {
            if (error instanceof UserInputError) {
              throw new UserInputError(`action ${i}: ${error}`);
            }
            throw error;
          }
        }),
    );
    // Create any _new_ entities
    await Promise.all(
      actions
        .map((action, i) => ({ action, i }))
        .filter(({ action }) => action.createEntity)
        .map(async ({ action, i }) => {
          try {
            const { entity: entityDefinition, accountId: entityAccountId } =
              action.createEntity!;

            // @todo remove duplication
            const updatedEntityDefinition = produce(
              entityDefinition,
              (draft) => {
                if (draft.existingEntity) {
                  const realId = getRealId(draft.existingEntity.entityId);
                  if (realId) {
                    draft.existingEntity.entityId = realId;
                  }
                }
                if (draft.entityType?.entityTypeId) {
                  const realId = getRealId(draft.entityType.entityTypeId);
                  if (realId) {
                    draft.entityType.entityTypeId = realId;
                  }
                }
              },
            );

            const entity = await Entity.createEntityWithLinks(client, {
              accountId: entityAccountId,
              user,
              entityDefinition: updatedEntityDefinition,
            });

            if (
              updatedEntityDefinition.placeholderID?.startsWith("placeholder-")
            ) {
              placeholderResults.set(
                updatedEntityDefinition.placeholderID,
                entity.entityId,
              );
            }
          } catch (error) {
            if (error instanceof UserInputError) {
              throw new UserInputError(`action ${i}: ${error}`);
            }
            throw error;
          }
        }),
    );

    // Create any _new_ blocks
    const newBlocks = await Promise.all(
      actions
        .map((action, i) => ({ action, i }))
        .filter(({ action }) => action.insertNewBlock)
        .map(async ({ action, i }) => {
          try {
            const {
              accountId: blockAccountId,
              componentId: blockComponentId,
              entity: blockDataDefinition,
              placeholderID,
            } = action.insertNewBlock!;

            const updatedBlockDataDefinition = produce(
              blockDataDefinition,
              (draft) => {
                if (draft.existingEntity) {
                  const realId = getRealId(draft.existingEntity.entityId);
                  if (realId) {
                    draft.existingEntity.entityId = realId;
                  }
                }
                if (draft.entityType?.entityTypeId) {
                  const realId = getRealId(draft.entityType.entityTypeId);
                  if (realId) {
                    draft.entityType.entityTypeId = realId;
                  }
                }
              },
            );

            const blockData = await Entity.createEntityWithLinks(client, {
              accountId: blockAccountId, // assume that the "block entity" is in the same account as the block itself
              user,
              entityDefinition: updatedBlockDataDefinition,
            });

            if (
              updatedBlockDataDefinition.placeholderID?.startsWith(
                "placeholder-",
              )
            ) {
              placeholderResults.set(
                updatedBlockDataDefinition.placeholderID,
                blockData.entityId,
              );
            }

            const block = await Block.createBlock(client, {
              blockData,
              createdBy: user,
              accountId: user.accountId,
              properties: {
                componentId: blockComponentId,
              },
            });

            if (placeholderID?.startsWith("placeholder-")) {
              placeholderResults.set(placeholderID, block.entityId);
            }

            return block;
          } catch (error) {
            if (error instanceof UserInputError) {
              throw new UserInputError(`action ${i}: ${error}`);
            }
            throw error;
          }
        }),
    );

    // Perform any block data swapping updates.
    await Promise.all(
      actions
        .map(({ swapBlockData }) => swapBlockData)
        .filter(
          (swapBlockData): swapBlockData is SwapBlockData => !!swapBlockData,
        )
        .map(async (swapBlockData) => {
          const block = await Block.getBlockById(client, {
            accountId: swapBlockData.accountId,
            entityId: swapBlockData.entityId,
          });

          if (!block) {
            throw new Error(
              `Block with entityId ${swapBlockData.entityId} not found`,
            );
          }

          return await block.swapBlockData(client, {
            targetDataAccountId: swapBlockData.newEntityAccountId,
            targetDataEntityId: swapBlockData.newEntityEntityId,
            updatedByAccountId: user.accountId,
          });
        }),
    );

    // Perform any entity updates.
    await Promise.all(
      actions
        .map(({ updateEntity }) => updateEntity)
        .filter((updateEntity): updateEntity is UpdateEntity => !!updateEntity)
        .map(async (updateEntity) => {
          return Entity.updateProperties(client, {
            ...updateEntity,
            updatedByAccountId: user.accountId,
          });
        }),
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
            block: newBlocks[insertCount]!,
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
            allowRemovingFinal: actions
              .slice(i + 1)
              .some((actionToFollow) => actionToFollow.insertNewBlock),
          });
        }
      } catch (err) {
        if (err instanceof UserInputError) {
          throw new UserInputError(`action ${i}: ${err}`);
        }
        throw err;
      }
    }

    return {
      page: page.toGQLUnknownEntity(),
      placeholders: Array.from(placeholderResults.entries()).map(
        ([placeholderID, entityID]) => ({ placeholderID, entityID }),
      ),
    };
  });
};
