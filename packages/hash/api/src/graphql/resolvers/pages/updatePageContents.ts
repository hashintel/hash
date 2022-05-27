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
  EntityDefinition,
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

const isPlaceholder = (id: unknown): id is string =>
  typeof id === "string" && id.startsWith("placeholder-");

// @todo these actions need to be processed in order to ensure placeholders
// work as expected
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

  const replacePlaceholder = (placeholder: string) => {
    if (isPlaceholder(placeholder)) {
      const realId = placeholderResults.get(placeholder);
      if (!realId) {
        throw new Error(`Real id for placeholder ${placeholder} missing`);
      }
      return realId;
    }
    return placeholder;
  };

  const recordEntity = (
    placeholder: string | null | undefined,
    entity: { entityId: string },
  ) => {
    if (isPlaceholder(placeholder)) {
      placeholderResults.set(placeholder, entity.entityId);
    }
  };

  return await dataSources.db.transaction(async (client) => {
    const createEntityWithPlaceholders = async (
      originalDefinition: EntityDefinition,
      entityAccountId: string,
    ) => {
      const entityDefinition = produce(originalDefinition, (draft) => {
        if (draft.existingEntity) {
          draft.existingEntity.entityId = replacePlaceholder(
            draft.existingEntity.entityId,
          );
        }
        if (draft.entityType?.entityTypeId) {
          draft.entityType.entityTypeId = replacePlaceholder(
            draft.entityType.entityTypeId,
          );
        }
        if (draft.entityProperties?.text?.__linkedData?.entityId) {
          draft.entityProperties.text.__linkedData.entityId =
            replacePlaceholder(
              draft.entityProperties.text.__linkedData.entityId,
            );
        }

        delete draft.placeholderID;
      });

      const entity = await Entity.createEntityWithLinks(client, {
        accountId: entityAccountId,
        user,
        entityDefinition,
      });

      recordEntity(entityDefinition.placeholderID, entity);

      return entity;
    };

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

            recordEntity(
              placeholderID,
              await EntityType.create(client, {
                accountId: entityTypeAccountId,
                createdByAccountId: user.accountId,
                description: description ?? undefined,
                name,
                schema,
              }),
            );
          } catch (error) {
            if (error instanceof UserInputError) {
              throw new UserInputError(`action ${i}: ${error}`);
            }
            throw error;
          }
        }),
    );

    // Create any _new_ entities
    for (const { action, i } of actions
      // eslint-disable-next-line @typescript-eslint/no-shadow
      .map((action, i) => ({ action, i }))
      // eslint-disable-next-line @typescript-eslint/no-shadow
      .filter(({ action }) => action.createEntity)) {
      try {
        const { entity: entityDefinition, accountId: entityAccountId } =
          action.createEntity!;

        await createEntityWithPlaceholders(entityDefinition, entityAccountId);
      } catch (error) {
        if (error instanceof UserInputError) {
          throw new UserInputError(`action ${i}: ${error}`);
        }
        throw error;
      }
    }

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
              placeholderID,
            } = action.insertNewBlock!;

            const blockData = await createEntityWithPlaceholders(
              action.insertNewBlock!.entity,
              // assume that the "block entity" is in the same account as the block itself
              blockAccountId,
            );

            const block = await Block.createBlock(client, {
              blockData,
              createdBy: user,
              accountId: user.accountId,
              properties: {
                componentId: blockComponentId,
              },
            });

            recordEntity(placeholderID, block);

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
