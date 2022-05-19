/* eslint-disable no-param-reassign */
import { ApolloClient } from "@apollo/client";
import { fetchBlockMeta } from "@hashintel/hash-shared/blockMeta";
import {
  EntityStorePluginAction,
  EntityStorePluginState,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  createEntity,
  createEntityType,
  getAccountEntityTypes,
} from "@hashintel/hash-shared/queries/entity.queries";
import { isEqual, uniqBy } from "lodash";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { v4 as uuid } from "uuid";
import {
  BlockEntity,
  blockEntityIdExists,
  getTextEntityFromSavedBlock,
  isDraftTextContainingEntityProperties,
} from "./entity";
import {
  DraftEntity,
  EntityStore,
  getDraftEntityFromEntityId,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entityStore";
import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  CreateEntityTypeSharedMutation,
  CreateEntityTypeSharedMutationVariables,
  GetAccountEntityTypesSharedQuery,
  GetAccountEntityTypesSharedQueryVariables,
  SystemTypeName,
  UpdatePageAction,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "./graphql/apiTypes.gen";
import {
  EntityNode,
  findComponentNode,
  isComponentNode,
  isEntityNode,
  textBlockNodeToEntityProperties,
} from "./prosemirror";
import { updatePageContents } from "./queries/page.queries";

type GetPlaceholder = (draftId: string) => string;

/**
 * Our operations need to combine the actions from the previous operation,
 * but the actual code to do this is a bit mundane / messes up code clarity,
 * so I've extracted that to a wrapper function. This means each operation
 * only needs to handle creating their own actions
 */
const defineOperation =
  <T extends any[]>(
    fn: (
      entities: BlockEntity[],
      ...args: T
    ) => readonly [UpdatePageAction[], BlockEntity[]],
  ) =>
  (
    existingActions: UpdatePageAction[],
    entities: BlockEntity[],
    ...args: T
  ): [UpdatePageAction[], BlockEntity[]] => {
    const [nextActions, nextEntities] = fn(entities, ...args);

    return [[...existingActions, ...nextActions], nextEntities];
  };

const removeBlocks = defineOperation(
  (entities: BlockEntity[], draftBlockEntityIds: DraftEntity["entityId"][]) => {
    const draftBlockEntityIdsSet = new Set(draftBlockEntityIds);

    const removedBlockEntities = entities
      .map((block, position) => [block, position] as const)
      .filter(([block]) => !draftBlockEntityIdsSet.has(block.entityId));

    const updatedEntities = entities.filter(
      (_, position) =>
        !removedBlockEntities.some(
          ([, removedPosition]) => removedPosition === position,
        ),
    );

    const actions = removedBlockEntities.map(
      ([, position], idx): UpdatePageAction => ({
        /**
         * Each removal results in the position of further removals being
         * subtracted by 1 – luckily we can just used the index in the array to
         * work this out
         */
        removeBlock: { position: position - idx },
      }),
    );

    return [actions, updatedEntities] as const;
  },
);

const moveBlocks = defineOperation(
  (entities: BlockEntity[], draftBlockEntityIds: DraftEntity["entityId"][]) => {
    const otherExistingBlockEntityIds = draftBlockEntityIds.filter(
      (blockEntityId) => !!blockEntityId,
    );

    const actions: UpdatePageAction[] = [];
    entities = [...entities];

    for (let position = 0; position < entities.length; position++) {
      const block = entities[position]!;
      const positionInDoc = otherExistingBlockEntityIds.findIndex(
        (blockEntityId) => blockEntityId === block.entityId,
      );

      if (positionInDoc < 0) {
        throw new Error(
          "invariant: found removed block whilst calculating movements",
        );
      }

      if (position !== positionInDoc) {
        actions.push({
          moveBlock: {
            currentPosition: position,
            newPosition: positionInDoc,
          },
        });
        entities.splice(position, 1);
        entities.splice(positionInDoc, 0, block);

        /**
         * @todo figure out how to calculate movements without starting again
         * after each movement
         */
        position = 0;
      }
    }
    return [actions, entities] as const;
  },
);

type CreatedEntities = Map<number, { accountId: string; entityId: string }>;

type BlockEntityNodeDescriptor = [EntityNode, number, string | null];

/**
 * @warning this does not apply its actions to the entities it returns as it is
 *          not necessary for the pipeline of calculations. Be wary of this.
 * @todo set correct entity types on new entities
 */
const insertBlocks = defineOperation(
  (
    entities: BlockEntity[],
    blockEntityNodes: BlockEntityNodeDescriptor[],
    createdEntities: CreatedEntities,
    entityStore: EntityStore,
    getPlaceholder: GetPlaceholder,
  ) => {
    const actions: UpdatePageAction[] = [];
    const exists = blockEntityIdExists(entities);

    for (const [
      position,
      [blockNode, blockNodePosition, blockEntityId],
    ] of Object.entries(blockEntityNodes)) {
      if (exists(blockEntityId)) {
        continue;
      }

      const componentNodeResult = findComponentNode(
        blockNode,
        blockNodePosition,
      );

      if (!componentNodeResult) {
        throw new Error("Unexpected prosemirror structure");
      }

      const [, nodePosition] = componentNodeResult;

      const draftBlockEntity = blockNode.attrs.draftId
        ? entityStore.draft[blockNode.attrs.draftId]
        : null;

      if (!draftBlockEntity || !isDraftBlockEntity(draftBlockEntity)) {
        throw new Error(
          "Cannot create block when entity does not yet exist or is corrupt",
        );
      }

      if (createdEntities.has(nodePosition)) {
        const createdEntity = createdEntities.get(nodePosition)!;

        actions.push({
          insertNewBlock: {
            position: Number(position),
            componentId: draftBlockEntity.properties.componentId,
            accountId: draftBlockEntity.accountId,
            placeholderID: getPlaceholder(draftBlockEntity.draftId),
            entity: {
              existingEntity: {
                entityId: createdEntity.entityId,
                accountId: createdEntity.accountId,
              },
            },
          },
        });
      } else {
        if (draftBlockEntity.entityId) {
          throw new Error("Cannot insert block when it already exists");
        }

        actions.push({
          insertNewBlock: {
            position: Number(position),
            componentId: draftBlockEntity.properties.componentId,
            accountId: draftBlockEntity.accountId,
            placeholderID: getPlaceholder(draftBlockEntity.draftId),
            entity: {
              entityProperties: draftBlockEntity.properties.entity.properties,
              entityType: {
                // @todo this needs to use the entity id instead of system type name, as it may not be correct
                systemTypeName: SystemTypeName.Text,
              },
              placeholderID: getPlaceholder(
                draftBlockEntity.properties.entity.draftId,
              ),
            },
          },
        });
      }
    }

    return [actions, entities] as const;
  },
);

/**
 * @warning this does not apply its actions to the entities it returns as it is
 *          not necessary for the pipeline of calculations. Be wary of this.
 * @todo use entity store
 */
const updateBlocks = defineOperation(
  (
    entities: BlockEntity[],
    nodes: BlockEntityNodeDescriptor[],
    entityStore: EntityStore,
  ) => {
    const exists = blockEntityIdExists(entities);

    /**
     * Currently when the same block exists on the page in multiple locations,
     * we prioritise the content of the first one that has changed when it
     * comes to working out if an un update is required. We need a better way
     * of handling this (i.e, take the *last* one that changed, and also more
     * immediately sync updates between changed blocks to prevent work being
     * lost)
     *
     * @todo improve this
     */
    const actions = uniqBy(
      nodes
        /**
         * An updated block also contains an updated entity, so we need to
         * create a list of entities that we need to post updates to via
         * GraphQL
         */
        .flatMap(([blockNode, blockNodePos, blockEntityId]) => {
          if (!exists(blockEntityId)) {
            return [];
          }

          const node = findComponentNode(blockNode, blockNodePos)?.[0];

          if (!node) {
            throw new Error("Unexpected prosemirror structure");
          }

          const savedEntity = entityStore.saved[blockEntityId];

          if (!savedEntity) {
            throw new Error("Entity missing from entity store");
          }

          if (!isBlockEntity(savedEntity)) {
            throw new Error("Non-block entity found when saving");
          }

          const childEntityId = savedEntity.properties.entity.entityId;
          const savedChildEntity = entityStore.saved[childEntityId];

          if (!savedChildEntity) {
            throw new Error("Child entity missing from entity store");
          }

          // @todo could probably get this from entity store
          const existingBlock = entities.find(
            (entity) => entity.entityId === blockEntityId,
          );

          if (!existingBlock) {
            throw new Error("Cannot find existing block entity");
          }

          const updates: UpdatePageAction[] = [];

          if (node.type.isTextblock) {
            const textEntity = getTextEntityFromSavedBlock(
              blockEntityId,
              entityStore,
            );

            if (!textEntity) {
              throw new Error(
                "invariant: text entity missing for updating text node",
              );
            }

            const { tokens } = textEntity.properties;
            const entityProperties = textBlockNodeToEntityProperties(node);

            if (!isEqual(tokens, entityProperties.tokens)) {
              updates.push({
                updateEntity: {
                  entityId: textEntity.entityId,
                  accountId: textEntity.accountId,
                  properties: entityProperties,
                },
              });
            }
          } else {
            const draftBlockEntity = getDraftEntityFromEntityId(
              entityStore.draft,
              savedEntity.entityId,
            );
            if (isBlockEntity(draftBlockEntity)) {
              const draftBlockData = getDraftEntityFromEntityId(
                entityStore.draft,
                draftBlockEntity.properties.entity.entityId,
              );

              // Check if block data changed by comparing properties
              if (
                draftBlockData?.entityId &&
                !isEqual(draftBlockData.properties, savedChildEntity.properties)
              ) {
                // If the entityId is different then the blockData was swapped
                if (draftBlockData.entityId !== savedChildEntity.entityId) {
                  updates.push({
                    swapBlockData: {
                      entityId: savedEntity.entityId,
                      accountId: savedEntity.accountId,
                      newEntityAccountId: draftBlockData.accountId,
                      newEntityEntityId: draftBlockData.entityId,
                    },
                  });
                } else {
                  updates.push({
                    updateEntity: {
                      entityId: draftBlockData.entityId,
                      accountId: draftBlockData.accountId,
                      properties: draftBlockData.properties,
                    },
                  });
                }
              }
            }
          }

          return updates;
        }),
      (action) => {
        if (action?.swapBlockData?.entityId) {
          return `swap_block_${action?.swapBlockData?.entityId}`;
        }
        if (action?.updateEntity?.entityId) {
          return `update_entity_${action.updateEntity?.entityId}`;
        }

        return null;
      },
    );

    return [actions, entities] as const;
  },
);

/**
 * This function (and the various subfunctions) are written to be as
 * readable as possible, as a priority over performance. Splitting it up into
 * processing each type of operation one at a time means I'm probably looping
 * more often that I need to. But it also makes the logic much more simple.
 *
 * This function loops through all the blocks on a page in order to
 * generate a list of actions to sync the api with the changes made by a
 * user. In order to do this, for each category of action, it loops through the
 * page blocks at least once, and compares them to result of the previous
 * action (or, if the first time, the result of the last save). When it finds a
 * difference, it produces an action which can reproduce that difference on
 * the API, and also emits a new version of the document with this action
 * applied optimistically, in order to aid further change calculations –
 * this is because each action is applied on the document produced by the
 * previous document, so we need to track this as our actions are developed.
 *
 * @todo this needs to be able to handle multiple blocks of the same id
 *       appearing on the same page
 */
const calculateSaveActions = (
  doc: ProsemirrorNode<Schema>,
  blocks: BlockEntity[],
  entityStore: EntityStore,
  createdEntities: CreatedEntities,
  getPlaceholder: GetPlaceholder,
) => {
  let actions: UpdatePageAction[] = [];

  const draftBlockEntityIds: DraftEntity["entityId"][] = [];
  const draftBlockEntityNodes: BlockEntityNodeDescriptor[] = [];

  doc.descendants((node, pos) => {
    if (isEntityNode(node)) {
      if (!node.attrs.draftId) {
        throw new Error("Unexpected prosemirror structure");
      }

      const draftEntity = entityStore.draft[node.attrs.draftId];

      if (!draftEntity || !isDraftBlockEntity(draftEntity)) {
        throw new Error("Unexpected prosemirror structure");
      }

      // @todo handle entityId not being set

      draftBlockEntityNodes.push([node, pos, draftEntity.entityId]);
      draftBlockEntityIds.push(draftEntity.entityId);

      return false;
    }
  });

  blocks = [...blocks];
  [actions, blocks] = removeBlocks(actions, blocks, draftBlockEntityIds);
  [actions, blocks] = moveBlocks(actions, blocks, draftBlockEntityIds);
  [actions, blocks] = insertBlocks(
    actions,
    blocks,
    draftBlockEntityNodes,
    createdEntities,
    entityStore,
    getPlaceholder,
  );
  [actions] = updateBlocks(actions, blocks, draftBlockEntityNodes, entityStore);

  return actions;
};

/**
 * @todo this assumption of the slug might be brittle,
 * @todo don't copy from server
 */
const capitalizeComponentName = (cId: string) => {
  let componentId = cId;

  // If there's a trailing slash, remove it
  const indexLastSlash = componentId.lastIndexOf("/");
  if (indexLastSlash === componentId.length - 1) {
    componentId = componentId.slice(0, -1);
  }

  //                      *
  // "https://example.org/value"
  const indexAfterLastSlash = componentId.lastIndexOf("/") + 1;
  return (
    //                      * and uppercase it
    // "https://example.org/value"
    componentId.charAt(indexAfterLastSlash).toUpperCase() +
    //                       ****
    // "https://example.org/value"
    componentId.substring(indexAfterLastSlash + 1)
  );
};

const randomPlaceholder = () => `placeholder-${uuid()}`;

export const createNecessaryEntities = async (
  entityStore: EntityStorePluginState,
  doc: ProsemirrorNode<Schema>,
  accountId: string,
  pageEntityId: string,
  client: ApolloClient<any>,
) => {
  const actions: EntityStorePluginAction[] = [];

  const entitiesToCreate = Object.values(entityStore.store.draft).flatMap(
    (entity) => {
      if (isDraftBlockEntity(entity)) {
        const innerEntity = entity.properties.entity;

        if (
          !innerEntity.entityId &&
          isDraftTextContainingEntityProperties(innerEntity.properties)
        ) {
          let blockEntityNodePosition: number | null = null;

          doc.descendants((node, pos) => {
            const resolved = doc.resolve(pos);

            if (isComponentNode(node)) {
              const blockEntityNode = resolved.node(2);

              if (!isEntityNode(blockEntityNode)) {
                throw new Error("Unexpected structure");
              }

              if (blockEntityNode.attrs.draftId === entity.draftId) {
                blockEntityNodePosition = pos;
              }
            }
          });

          if (blockEntityNodePosition === null) {
            throw new Error("Did not find position");
          }

          return [
            {
              componentId: entity.properties.componentId,
              entity: innerEntity,
              textLink: innerEntity.properties.text,
              blockEntityNodePosition,
            },
          ];
        }
      }

      return [];
    },
  );

  const createdEntities: CreatedEntities = new Map();

  for (const {
    componentId,
    entity,
    textLink,
    blockEntityNodePosition,
  } of entitiesToCreate) {
    const updatePageContentsActions: UpdatePageAction[] = [];

    let variantEntityProperties;

    if (textLink.data.entityId) {
      const textLinkDataEntity =
        entityStore.store.saved[textLink.data.entityId];

      if (!textLinkDataEntity) {
        throw new Error("Entity belonging to text link is missing");
      }

      variantEntityProperties = {
        ...entity.properties,
        text: {
          __linkedData: {
            entityTypeId: textLinkDataEntity.entityTypeId,
            entityId: textLink.data.entityId,
          },
        },
      };
    } else {
      const textEntityResult = await client.mutate<
        CreateEntityMutation,
        CreateEntityMutationVariables
      >({
        mutation: createEntity,
        variables: {
          properties: textLink.data.properties,
          systemTypeName: SystemTypeName.Text,
          accountId,
          versioned: true,
        },
      });

      // @todo may not be necessary as may be handled elsewhere
      actions.push({
        type: "updateEntityId",
        payload: {
          entityId: textEntityResult.data!.createEntity.entityId,
          draftId: textLink.data.draftId,
        },
      });

      variantEntityProperties = {
        ...entity.properties,
        text: {
          __linkedData: {
            entityTypeId: textEntityResult.data!.createEntity.entityTypeId,
            entityId: textEntityResult.data!.createEntity.entityId,
          },
        },
      };
    }

    const entityTypes = await client.query<
      GetAccountEntityTypesSharedQuery,
      GetAccountEntityTypesSharedQueryVariables
    >({
      query: getAccountEntityTypes,
      variables: { accountId, includeOtherTypesInUse: true },
      fetchPolicy: "network-only",
    });

    const componentMeta = await fetchBlockMeta(componentId);

    // @todo use stored component id for entity type, instead of properties
    const componentSchemaKeys = Object.keys(
      componentMeta.componentSchema.properties ?? {},
    ).sort();

    componentSchemaKeys.splice(componentSchemaKeys.indexOf("editableRef"), 1);
    let desiredEntityTypeId = entityTypes.data.getAccountEntityTypes.find(
      (type) =>
        isEqual(
          Object.keys(type.properties.properties ?? {}).sort(),
          componentSchemaKeys,
        ),
    )?.entityId;

    if (!desiredEntityTypeId) {
      const jsonSchema = JSON.parse(
        JSON.stringify(componentMeta.componentSchema),
      );

      delete jsonSchema.properties.editableRef;

      const entityTypePlaceholder = randomPlaceholder();

      updatePageContentsActions.push({
        createEntityType: {
          accountId,
          // @todo need to add the text field to this
          schema: jsonSchema,
          name: capitalizeComponentName(componentId) + uuid(),
          placeholderID: entityTypePlaceholder,
        },
      });

      desiredEntityTypeId = entityTypePlaceholder;
    }

    const variantEntityPlaceholder = randomPlaceholder();
    const result = await client.mutate<
      UpdatePageContentsMutation,
      UpdatePageContentsMutationVariables
    >({
      mutation: updatePageContents,
      variables: {
        accountId,
        entityId: pageEntityId,
        actions: [
          ...updatePageContentsActions,
          {
            createEntity: {
              accountId,
              entity: {
                placeholderID: variantEntityPlaceholder,
                versioned: true,
                entityType: {
                  entityTypeId: desiredEntityTypeId,
                },
                entityProperties: variantEntityProperties,
              },
            },
          },
        ],
      },
    });

    const newVariantEntityId =
      result.data!.updatePageContents.placeholders.find(
        ({ placeholderID }) => placeholderID === variantEntityPlaceholder,
      )!.entityID;

    createdEntities.set(blockEntityNodePosition, {
      accountId,
      entityId: newVariantEntityId,
    });
  }

  return { actions, createdEntities };
};

/**
 * @todo use draft entity store for this
 */
export const updatePageMutation = async (
  accountId: string,
  entityId: string,
  doc: ProsemirrorNode<Schema>,
  blocks: BlockEntity[],
  entityStore: EntityStore,
  client: ApolloClient<any>,
  createdEntities: CreatedEntities,
  getPlaceholder: GetPlaceholder,
) => {
  const actions = calculateSaveActions(
    doc,
    blocks,
    entityStore,
    createdEntities,
    getPlaceholder,
  );

  const res = await client.mutate<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >({
    variables: { actions, accountId, entityId },
    mutation: updatePageContents,
  });

  if (!res.data) {
    throw new Error("Failed");
  }

  await client.reFetchObservableQueries();

  return res.data.updatePageContents;
};
