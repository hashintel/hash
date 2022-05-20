/* eslint-disable no-param-reassign */
import { ApolloClient } from "@apollo/client";
import {
  EntityStorePluginAction,
  EntityStorePluginState,
} from "@hashintel/hash-shared/entityStorePlugin";
import { isEqual, uniqBy } from "lodash";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { v4 as uuid } from "uuid";
import {
  BlockEntity,
  blockEntityIdExists,
  getTextEntityFromSavedBlock,
  isDraftTextContainingEntityProperties,
  isDraftTextEntity,
  isTextContainingEntityProperties,
  isTextEntity,
} from "./entity";
import {
  DraftEntity,
  EntityStore,
  getDraftEntityFromEntityId,
  isBlockEntity,
  isDraftBlockEntity,
} from "./entityStore";
import {
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
                // @todo this should be the placeholder
                entityId: createdEntity.entityId,
                accountId: draftBlockEntity.properties.entity.accountId,
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
 * @todo use draft entity store for this
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

// @todo consider rewriting not to use doc
// const createNecessaryEntities = async (
//   entityStore: EntityStorePluginState,
//   doc: ProsemirrorNode<Schema>,
//   accountId: string,
//   pageEntityId: string,
//   client: ApolloClient<any>,
// ) => {
//
//
//   return [updatePageContentsActions, createdEntities, entityStoreActions] as const;
// };

const updatePageMutationWithActions = async (
  accountId: string,
  pageEntityId: string,
  doc: ProsemirrorNode<Schema>,
  blocks: BlockEntity[],
  store: EntityStore,
  apolloClient: ApolloClient<unknown>,
  createdEntities: Map<number, { accountId: string; entityId: string }>,
  getPlaceholder: (draftId: string) => string,
  getDraftId: (placeholderId: string) => string | undefined,
) => {
  const mutationActions = calculateSaveActions(
    doc,
    blocks,
    store,
    createdEntities,
    getPlaceholder,
  );

  const res = await apolloClient.mutate<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >({
    variables: { actions: mutationActions, accountId, entityId: pageEntityId },
    mutation: updatePageContents,
  });

  if (!res.data) {
    throw new Error("Failed");
  }

  // @todo is this still necessary
  await apolloClient.reFetchObservableQueries();

  const result = res.data.updatePageContents;

  const newActions: EntityStorePluginAction[] = [];

  for (const placeholder of result.placeholders) {
    const draftId = getDraftId(placeholder.placeholderID);
    if (draftId) {
      newActions.push({
        type: "updateEntityId",
        payload: {
          draftId,
          entityId: placeholder.entityID,
        },
      });
    }
  }
  return [result.page.properties.contents, newActions] as const;
};

const calculateEntitiesToCreate = (
  entityStore: EntityStorePluginState,
  doc: ProsemirrorNode<Schema>,
) => {
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
  return entitiesToCreate;
};

// export const save = async (
//   apolloClient: ApolloClient<unknown>,
//   accountId: string,
//   pageEntityId: string,
//   blocks: BlockEntity[],
//   getDoc: () => ProsemirrorNode<Schema>,
//   getState: () => EntityStorePluginState,
//   updateState: (
//     nextActions: EntityStorePluginAction[],
//   ) => EntityStorePluginState,
// ) => {
//   const entityStoreActions: EntityStorePluginAction[] = [];
//
//   const entityStore = getState();
//   const doc = getDoc();
//   const entitiesToCreate = calculateEntitiesToCreate(entityStore, doc);
//   const createdEntities: CreatedEntities = new Map();
//   const entityTypeForComponentId = new Map<string, string>();
//   const entityTypes = await apolloClient.query<
//     GetAccountEntityTypesSharedQuery,
//     GetAccountEntityTypesSharedQueryVariables
//   >({
//     query: getAccountEntityTypes,
//     variables: { accountId, includeOtherTypesInUse: true },
//     fetchPolicy: "network-only",
//   });
//
//   /**
//    * @todo shouldn't need an existing text entity to find this
//    */
//   const textEntityTypeId = entityTypes.data.getAccountEntityTypes.find(
//     (type) => type.properties.title === "Text",
//   )?.entityId;
//
//   if (!textEntityTypeId) {
//     throw new Error("No text entities exist. Cannot find text entity type id");
//   }
//
//   const updatePageContentsActions: UpdatePageAction[] = [];
//
//   const placeholderIdToDraftId = new Map<string, string>();
//   const blockPositionToPlaceholder = new Map<number, string>();
//
//   for (const {
//     componentId,
//     entity,
//     textLink,
//     blockEntityNodePosition,
//   } of entitiesToCreate) {
//     let variantEntityProperties;
//
//     if (textLink.data.entityId) {
//       const textLinkDataEntity =
//         entityStore.store.saved[textLink.data.entityId];
//
//       if (!textLinkDataEntity) {
//         throw new Error("Entity belonging to text link is missing");
//       }
//
//       variantEntityProperties = {
//         ...entity.properties,
//         text: {
//           __linkedData: {
//             entityTypeId: textLinkDataEntity.entityTypeId,
//             entityId: textLink.data.entityId,
//           },
//         },
//       };
//     } else {
//       const placeholder = randomPlaceholder();
//       placeholderIdToDraftId.set(placeholder, textLink.data.draftId);
//
//       updatePageContentsActions.push({
//         createEntity: {
//           accountId,
//           entity: {
//             versioned: true,
//             placeholderID: placeholder,
//             entityType: {
//               systemTypeName: SystemTypeName.Text,
//             },
//             entityProperties: textLink.data.properties,
//           },
//         },
//       });
//
//       variantEntityProperties = {
//         ...entity.properties,
//         text: {
//           __linkedData: {
//             entityTypeId: textEntityTypeId,
//             entityId: placeholder,
//           },
//         },
//       };
//     }
//
//     let desiredEntityTypeId: string | undefined =
//       entityTypeForComponentId.get(componentId);
//
//     if (!desiredEntityTypeId) {
//       const componentMeta = await fetchBlockMeta(componentId);
//
//       // @todo use stored component id for entity type, instead of properties
//       const componentSchemaKeys = Object.keys(
//         componentMeta.componentSchema.properties ?? {},
//       ).sort();
//
//       componentSchemaKeys.splice(componentSchemaKeys.indexOf("editableRef"), 1);
//       desiredEntityTypeId = entityTypes.data.getAccountEntityTypes.find(
//         (type) =>
//           isEqual(
//             Object.keys(type.properties.properties ?? {}).sort(),
//             componentSchemaKeys,
//           ),
//       )?.entityId;
//
//       // @todo fix this
//       if (!desiredEntityTypeId || true) {
//         const jsonSchema = JSON.parse(
//           JSON.stringify(componentMeta.componentSchema),
//         );
//
//         delete jsonSchema.properties.editableRef;
//
//         const entityTypePlaceholder = randomPlaceholder();
//
//         updatePageContentsActions.push({
//           createEntityType: {
//             accountId,
//             // @todo need to add the text field to this
//             schema: jsonSchema,
//             name: capitalizeComponentName(componentId) + uuid(),
//             placeholderID: entityTypePlaceholder,
//           },
//         });
//
//         desiredEntityTypeId = entityTypePlaceholder;
//       }
//     }
//
//     if (!desiredEntityTypeId) {
//       throw new Error("Cannot find entity type for variant entity");
//     }
//
//     entityTypeForComponentId.set(componentId, desiredEntityTypeId);
//
//     const variantEntityPlaceholder = randomPlaceholder();
//     blockPositionToPlaceholder.set(
//       blockEntityNodePosition,
//       variantEntityPlaceholder,
//     );
//
//     updatePageContentsActions.push({
//       createEntity: {
//         accountId,
//         entity: {
//           placeholderID: variantEntityPlaceholder,
//           versioned: true,
//           entityType: {
//             entityTypeId: desiredEntityTypeId,
//           },
//           entityProperties: variantEntityProperties,
//         },
//       },
//     });
//   }
//
//   if (updatePageContentsActions.length) {
//     const result = await apolloClient.mutate<
//       UpdatePageContentsMutation,
//       UpdatePageContentsMutationVariables
//     >({
//       mutation: updatePageContents,
//       variables: {
//         accountId,
//         entityId: pageEntityId,
//         actions: updatePageContentsActions,
//       },
//     });
//     for (const [
//       blockEntityNodePosition,
//       variantEntityPlaceholder,
//     ] of blockPositionToPlaceholder.entries()) {
//       const newVariantEntityId =
//         result.data!.updatePageContents.placeholders.find(
//           ({ placeholderID }) => placeholderID === variantEntityPlaceholder,
//         )!.entityID;
//
//       createdEntities.set(blockEntityNodePosition, {
//         accountId,
//         entityId: newVariantEntityId,
//       });
//     }
//     for (const [placeholderId, draftId] of placeholderIdToDraftId.entries()) {
//       const entityId = result.data!.updatePageContents.placeholders.find(
//         ({ placeholderID }) => placeholderID === placeholderId,
//       )!.entityID;
//
//       entityStoreActions.push({
//         type: "updateEntityId",
//         payload: {
//           entityId,
//           draftId,
//         },
//       });
//     }
//   }
//
//   updateState(entityStoreActions);
//
//   const placeholders = new Map<string, string>();
//
//   const [newBlocks, newActions] = await updatePageMutationWithActions(
//     accountId,
//     pageEntityId,
//     getDoc(),
//     blocks,
//     getState().store,
//     apolloClient,
//     createdEntities,
//     (draftId: string) => {
//       const newPlaceholder = `placeholder-${uuid()}`;
//       placeholders.set(newPlaceholder, draftId);
//       return newPlaceholder;
//     },
//     (placeholderId: string) => {
//       return placeholders.get(placeholderId);
//     },
//   );
//
//   updateState(newActions);
//
//   return newBlocks;
// };

export const save = async (
  apolloClient: ApolloClient<unknown>,
  accountId: string,
  pageEntityId: string,
  blocks: BlockEntity[],
  getDoc: () => ProsemirrorNode<Schema>,
  getState: () => EntityStorePluginState,
  updateState: (
    nextActions: EntityStorePluginAction[],
  ) => EntityStorePluginState,
) => {
  const state = getState();
  const actions: UpdatePageAction[] = [];

  const draftToPlaceholder = new Map<string, string>();
  const visited = new Set<string>();

  const draftBlockEntities = new Map<string, DraftEntity<BlockEntity>>();

  for (const draftEntity of Object.values(state.store.draft)) {
    if (isDraftBlockEntity(draftEntity)) {
      draftBlockEntities.set(draftEntity.draftId, draftEntity);
      continue;
    }

    if (visited.has(draftEntity.draftId)) {
      continue;
    }

    visited.add(draftEntity.draftId);

    if (draftEntity.entityId) {
      const savedEntity = state.store.saved[draftEntity.entityId];

      if (!savedEntity) {
        throw new Error("Saved entity missing");
      }

      if (isEqual(draftEntity.properties, savedEntity.properties)) {
        continue;
      }

      if (
        !isDraftBlockEntity(draftEntity) &&
        !isDraftTextContainingEntityProperties(draftEntity.properties)
      ) {
        console.log(draftEntity.properties);
        actions.push({
          updateEntity: {
            entityId: draftEntity.entityId,
            accountId: draftEntity.accountId,
            properties: draftEntity.properties,
          },
        });
      }

      // if (isDraftBlockEntity(draftEntity) || isDraftTextContainingEntityProperties(draftEntity.properties)) {
      //   // @todo not sure how to handle this yet
      // } else if (!isEqual(draftEntity.properties, ))
    } else {
      if (
        isTextContainingEntityProperties(draftEntity.properties) ||
        !isDraftTextEntity(draftEntity)
      ) {
        throw new Error("@TODO IMPLEMENT THIS");
      }

      const placeholder = randomPlaceholder();

      draftToPlaceholder.set(draftEntity.draftId, placeholder);

      actions.push({
        createEntity: {
          accountId: draftEntity.accountId,
          entity: {
            entityType: {
              systemTypeName: SystemTypeName.Text,
            },
            versioned: true,
            entityProperties: draftEntity.properties,
            placeholderID: placeholder,
          },
        },
      });
    }
  }

  // @todo handle errors
  const beforeBlockDraftIds = blocks.map(
    (block) =>
      getDraftEntityFromEntityId(state.store.draft, block.entityId)!.draftId,
  );

  const afterBlockDraftIds: string[] = [];

  getDoc().descendants((node) => {
    if (isEntityNode(node)) {
      if (!node.attrs.draftId) {
        throw new Error("Missing draft id");
      }

      const draftEntity = state.store.draft[node.attrs.draftId];

      if (!draftEntity) {
        throw new Error("Missing draft entity");
      }

      if (isDraftBlockEntity(draftEntity)) {
        afterBlockDraftIds.push(draftEntity.draftId);
        return false;
      }
    }

    return true;
  });

  let position = 0;
  let itCount = 0;
  while (
    position < Math.max(beforeBlockDraftIds.length, afterBlockDraftIds.length)
  ) {
    itCount += 1;

    if (itCount === 1000) {
      throw new Error("Max iteration count");
    }

    const afterDraftId = afterBlockDraftIds[position];
    const beforeDraftId = beforeBlockDraftIds[position];

    console.log(
      "Checking position",
      position,
      Math.max(beforeBlockDraftIds.length, afterBlockDraftIds.length),
      { beforeDraftId, afterDraftId },
    );

    if (afterDraftId && beforeDraftId) {
      if (afterDraftId !== beforeDraftId) {
        actions.push({ removeBlock: { position } });
        beforeBlockDraftIds.splice(position, 1);
      } else {
        position += 1;
      }
    } else if (beforeDraftId) {
      actions.push({ removeBlock: { position } });
      beforeBlockDraftIds.splice(position, 1);
    } else if (afterDraftId) {
      const draftEntity = draftBlockEntities.get(afterDraftId);

      if (!draftEntity) {
        throw new Error("missing draft entity");
      }

      const blockData = draftEntity.properties.entity;
      // @note may be a placeholder if the data entity was created within this save
      const dataEntityId =
        blockData.entityId ?? draftToPlaceholder.get(blockData.draftId);

      if (!dataEntityId) {
        throw new Error("Block data entity id missing");
      }

      const dataAccountId = blockData.accountId;

      actions.push({
        insertNewBlock: {
          accountId: draftEntity.accountId,
          componentId: draftEntity.properties.componentId,
          position,
          entity: {
            existingEntity: {
              accountId: dataAccountId,
              entityId: dataEntityId,
            },
          },
        },
      });
      beforeBlockDraftIds.splice(position, 0, afterDraftId);
    } else {
      throw new Error("Position out of bounds");
    }
  }

  console.log(
    JSON.stringify(
      {
        actions,
        beforeBlockDraftIds,
        afterBlockDraftIds,
        equal:
          JSON.stringify(beforeBlockDraftIds) ===
          JSON.stringify(afterBlockDraftIds),
      },
      null,
      "\t",
    ),
  );

  const res = await apolloClient.mutate<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >({
    variables: { actions, accountId, entityId: pageEntityId },
    mutation: updatePageContents,
  });

  if (!res.data) {
    throw new Error("Failed");
  }

  // @todo is this still necessary
  await apolloClient.reFetchObservableQueries();

  const result = res.data.updatePageContents;

  // const newActions: EntityStorePluginAction[] = [];
  //
  // for (const placeholder of result.placeholders) {
  //   const draftId = getDraftId(placeholder.placeholderID);
  //   if (draftId) {
  //     newActions.push({
  //       type: "updateEntityId",
  //       payload: {
  //         draftId,
  //         entityId: placeholder.entityID,
  //       },
  //     });
  //   }
  // }

  // updateState(newActions);

  return result.page.properties.contents;
};
