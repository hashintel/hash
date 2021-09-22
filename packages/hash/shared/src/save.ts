// @todo maybe this type needs to be named in more places
import { EditorState } from "prosemirror-state";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EntityStore, EntityStoreType, isBlockEntity } from "./entityStore";
import { ApolloClient } from "@apollo/client";
import { updatePageContents } from "./queries/page.queries";
import {
  SystemTypeName,
  UpdatePageAction,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "./graphql/apiTypes.gen";
import { isEqual, omit, uniqBy } from "lodash";
import { Block, invertedBlockPaths } from "./sharedWithBackend";
import { BlockEntity } from "./types";

type EntityNode = Omit<ProsemirrorNode<Schema>, "attrs"> & {
  attrs: {
    entityId: string | null;
  };
};

// @todo type this properly
const nodeToEntityProperties = (node: ProsemirrorNode<Schema>) =>
  node.type.isTextblock
    ? {
        texts:
          (node.content.toJSON() as any[])
            ?.filter((child: any) => child.type === "text")
            .map((child: any) => {
              const marks = new Set<string>(
                child.marks?.map((mark: any) => mark.type) ?? []
              );

              return {
                text: child.text,
                bold: marks.has("strong"),
                italics: marks.has("em"),
                underline: marks.has("underlined"),
              };
            }) ?? [],
      }
    : undefined;

const nodeToComponentId = (node: ProsemirrorNode<Schema>) => node.type.name;

const isEntityNode = (node: ProsemirrorNode<any>): node is EntityNode =>
  !!node.type.spec.attrs && "entityId" in node.type.spec.attrs;

const findEntityNodes = (doc: ProsemirrorNode<any>) => {
  const entityNodes: EntityNode[] = [];

  doc.descendants((node) => {
    if (node.type.name === "block") {
      return true;
    }

    if (isEntityNode(node)) {
      entityNodes.push(node);
    }

    return false;
  });

  return entityNodes;
};

const entityIdExists = (entities: BlockEntity[]) => {
  const ids = new Set(entities.map((block) => block.metadataId));

  return (entityId: string | null): entityId is string =>
    !!entityId && ids.has(entityId);
};

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
    ) => readonly [UpdatePageAction[], BlockEntity[]]
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
  (entities: BlockEntity[], nodes: EntityNode[]) => {
    const draftBlockEntityIds = new Set(
      nodes.map((node) => node.attrs.entityId)
    );

    const removedBlockEntities = entities
      .map((block, position) => [block, position] as const)
      .filter(([block]) => !draftBlockEntityIds.has(block.metadataId));

    const updatedEntities = entities.filter(
      (_, position) =>
        !removedBlockEntities.some(
          ([, removedPosition]) => removedPosition === position
        )
    );

    const actions = removedBlockEntities.map(
      ([, position], idx): UpdatePageAction => ({
        /**
         * Each removal results in the position of further removals being
         * subtracted by 1 – luckily we can just used the index in the array to
         * work this out
         */
        removeBlock: { position: position - idx },
      })
    );

    return [actions, updatedEntities] as const;
  }
);

const moveBlocks = defineOperation(
  (entities: BlockEntity[], nodes: EntityNode[]) => {
    const entitiesWithoutNewBlocks = nodes.filter(
      (node) => !!node.attrs.entityId
    );

    const actions: UpdatePageAction[] = [];
    entities = [...entities];

    for (let position = 0; position < entities.length; position++) {
      const block = entities[position];
      const positionInDoc = entitiesWithoutNewBlocks.findIndex(
        (node) => node.attrs.entityId === block.metadataId
      );

      if (positionInDoc < 0) {
        throw new Error(
          "invariant: found removed block whilst calculating movements"
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
  }
);

const insertBlocks = defineOperation(
  (entities: BlockEntity[], nodes: EntityNode[], accountId: string) => {
    const actions: UpdatePageAction[] = [];
    const exists = entityIdExists(entities);

    for (const [position, node] of Object.entries(nodes)) {
      if (exists(node.attrs.entityId)) {
        continue;
      }

      actions.push({
        insertNewBlock: {
          position: Number(position),
          componentId: nodeToComponentId(node),
          accountId,
          entityProperties: nodeToEntityProperties(node),
          // @todo support new non-text nodes
          systemTypeName: SystemTypeName.Text,
        },
      });
    }

    return [actions, entities] as const;
  }
);

const updateBlocks = defineOperation(
  (entities: BlockEntity[], nodes: EntityNode[], entityStore: EntityStore) => {
    const exists = entityIdExists(entities);

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
        .flatMap((node) => {
          const { entityId } = node.attrs;

          if (!exists(entityId)) {
            return [];
          }

          // @todo this is where cached properties should be being set
          // cachedPropertiesByEntity[entityId] = node.attrs.properties;

          const savedEntity = (
            entityStore as Record<string, EntityStoreType | undefined>
          )[entityId];

          if (!savedEntity) {
            throw new Error("Entity missing from entity store");
          }

          if (!isBlockEntity(savedEntity)) {
            throw new Error("Non-block entity found when saving");
          }

          const childEntityId = savedEntity.properties.entity.metadataId;
          const savedChildEntity = entityStore[childEntityId];

          if (!savedChildEntity) {
            throw new Error("Child entity missing from entity store");
          }

          // @todo could probably get this from entity store
          const existingBlock = entities.find(
            (existingBlock) => existingBlock.metadataId === entityId
          );

          if (!existingBlock) {
            throw new Error("Cannot find existing block entity");
          }

          const updates: UpdatePageAction[] = [];
          const componentId = nodeToComponentId(node);

          if (componentId !== existingBlock.properties.componentId) {
            updates.push({
              updateEntity: {
                entityId: entityId,
                accountId: savedEntity.accountId,
                properties: {
                  componentId: componentId,
                  entityId: savedChildEntity.metadataId,
                  accountId: savedChildEntity.accountId,
                },
              },
            });
          }

          if (node.type.isTextblock) {
            const texts =
              "textProperties" in existingBlock.properties.entity
                ? existingBlock.properties.entity.textProperties.texts
                : undefined;

            const entityProperties = nodeToEntityProperties(node);

            if (
              !isEqual(
                texts?.map((text) => omit(text, "__typename")),
                entityProperties?.texts
              )
            ) {
              updates.push({
                updateEntity: {
                  entityId: childEntityId,
                  accountId: savedChildEntity.accountId,
                  properties: entityProperties,
                },
              });
            }
          }

          return updates;
        }),
      (action) => action.updateEntity?.entityId
    );

    return [actions, entities] as const;
  }
);

const calculateSaveActions = (
  accountId: string,
  pageId: string,
  metadataId: string,
  doc: ProsemirrorNode<Schema>,
  blocks: BlockEntity[],
  entityStore: EntityStore
): UpdatePageAction[] => {
  const blockEntityNodes = findEntityNodes(doc);
  let actions: UpdatePageAction[] = [];

  blocks = [...blocks];
  [actions, blocks] = removeBlocks(actions, blocks, blockEntityNodes);
  [actions, blocks] = moveBlocks(actions, blocks, blockEntityNodes);
  [actions, blocks] = insertBlocks(
    actions,
    blocks,
    blockEntityNodes,
    accountId
  );
  [actions] = updateBlocks(actions, blocks, blockEntityNodes, entityStore);

  return actions;
};

export const updatePageMutation = async (
  accountId: string,
  pageId: string,
  metadataId: string,
  doc: ProsemirrorNode<Schema>,
  blocks: BlockEntity[],
  entityStore: EntityStore,
  client: ApolloClient<any>
) => {
  const actions = calculateSaveActions(
    accountId,
    pageId,
    metadataId,
    doc,
    blocks,
    entityStore
  );

  await client.mutate<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >({
    variables: { actions, accountId, entityId: metadataId },
    mutation: updatePageContents,
  });

  await client.reFetchObservableQueries();
};
