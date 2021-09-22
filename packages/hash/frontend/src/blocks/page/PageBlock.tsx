import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  VoidFunctionComponent,
} from "react";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { renderPM } from "./sandbox";
import { createMarksTooltip } from "../../components/MarksTooltip";
import { createBlockSuggester } from "../../components/BlockSuggester";
import { usePortals } from "./usePortals";
import { useDeferredCallback } from "./useDeferredCallback";
import { BlockMetaContext } from "../blockMeta";
import { createInitialDoc, createSchema } from "@hashintel/hash-shared/schema";
import {
  Block,
  BlockMeta,
  cachedPropertiesByEntity,
  createEntityUpdateTransaction,
  defineNewBlock,
  invertedBlockPaths,
} from "@hashintel/hash-shared/sharedWithBackend";
import { collabEnabled, createNodeView } from "./tsUtils";
import { EditorConnection } from "./collab/collab";
import {
  PageFieldsFragment,
  UpdatePageAction,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { EntityStoreContext } from "./EntityStoreContext";
import {
  createEntityStore,
  EntityStore,
  EntityStoreType,
  isBlockEntity,
} from "@hashintel/hash-shared/entityStore";
import { isEqual, omit, uniqBy } from "lodash";
import {
  SystemTypeName,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "../../graphql/apiTypes.gen";
import { ApolloClient, useApolloClient, useMutation } from "@apollo/client";
import { updatePageContents } from "@hashintel/hash-shared/queries/page.queries";

// @todo maybe this type needs to be named in more places
type BlockEntity = PageFieldsFragment["properties"]["contents"][number];

type PageBlockProps = {
  contents: BlockEntity[];
  blocksMeta: Map<string, BlockMeta>;
  pageId: string;
  accountId: string;
  metadataId: string;
};

if (typeof localStorage !== "undefined") {
  const localStorageCachedPropertiesByEntity =
    JSON.parse(
      typeof localStorage !== "undefined"
        ? localStorage.getItem("cachedPropertiesByEntity") ?? "{}"
        : "{}"
    ) ?? {};

  Object.assign(cachedPropertiesByEntity, localStorageCachedPropertiesByEntity);

  setInterval(() => {
    const stringifiedProperties = JSON.stringify(cachedPropertiesByEntity);

    // Temporarily catch all errors to avoid QuotaExceededError run-time errors
    try {
      localStorage.setItem("cachedPropertiesByEntity", stringifiedProperties);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "unknown";
      console.warn(
        `Caught ${errorName} error when setting "cachedPropertiesByEntity" in local storage`
      );
    }
  }, 500);
}

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

/**
 * @todo get this info from entity store & a separate component register
 */
const nodeToComponentId = (node: ProsemirrorNode<Schema>) => {
  const nodeType = node.type;

  // @todo type this properly – get this from somewhere else
  const meta = (nodeType as any).defaultAttrs
    .meta as Block["componentMetadata"];

  return invertedBlockPaths[meta.url] ?? meta.url;
};

type EntityNode = Omit<ProsemirrorNode<Schema>, "attrs"> & {
  attrs: {
    entityId: string | null;
  };
};

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
                  entityId: savedChildEntity.id,
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

/**
 * @todo better name, move to shared package
 * @todo this needs to be able to handle multiple instances of the same block
 */
const calculateSaveActions = (
  accountId: string,
  pageId: string,
  metadataId: string,
  state: EditorState<Schema>,
  blocks: BlockEntity[],
  entityStore: EntityStore
): UpdatePageAction[] => {
  const blockEntityNodes = findEntityNodes(state.doc);
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

const updatePageMutation = async (
  accountId: string,
  pageId: string,
  metadataId: string,
  state: EditorState<Schema>,
  blocks: BlockEntity[],
  entityStore: EntityStore,
  client: ApolloClient<any>
) => {
  const actions = calculateSaveActions(
    accountId,
    pageId,
    metadataId,
    state,
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

/**
 * The naming of this as a "Block" is… interesting, considering it doesn't
 * really work like a Block. It would be cool to somehow detach the process of
 * rendering child blocks from this and have a renderer, but it seems tricky to
 * do that
 */
export const PageBlock: VoidFunctionComponent<PageBlockProps> = ({
  contents,
  blocksMeta,
  pageId,
  accountId,
  metadataId,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const client = useApolloClient();
  const [updatePageContentsFn] = useMutation<
    UpdatePageContentsMutation,
    UpdatePageContentsMutationVariables
  >(updatePageContents);

  const [portals, replacePortal] = usePortals();
  const [deferCallback, clearCallback] = useDeferredCallback();

  const prosemirrorSetup = useRef<null | {
    view: EditorView;
    schema: Schema;
    connection: EditorConnection | null;
  }>(null);

  /**
   * smart hack: provide a live reference to "contents" for all other effects
   * that cannot list "contents" as a dependency for reasons.
   */
  const currentContents = useRef(contents);
  useLayoutEffect(() => {
    currentContents.current = contents;
  }, [contents]);

  /**
   * There's a potential minor problem here which is that entity store is
   * updated before prosemirror's tree has yet updated to apply the new
   * contents, meaning they can become out of sync. This shouldn't be a problem
   * unless/until the ids used to link between PM and entity store are
   * inconsistent between saves (i.e, if they're versioned linked). This is
   * because any deletions from contents are driven by PM, meaning that by the
   * time they disappear from the entity store, they've already been deleted
   * from the PM tree by the user
   */
  const entityStoreValue = useMemo(
    () => createEntityStore(contents),
    [contents]
  );

  const currentEntityStoreValue = useRef(entityStoreValue);
  useLayoutEffect(() => {
    currentEntityStoreValue.current = entityStoreValue;
  }, [entityStoreValue]);

  const updateContents = useCallback(
    async (
      contents: PageFieldsFragment["properties"]["contents"],
      signal?: AbortSignal
    ): Promise<void> => {
      const setup = prosemirrorSetup.current;
      if (!setup) {
        return;
      }

      const { view } = setup;

      const state = view.state;

      const tr = await createEntityUpdateTransaction(state, contents, {
        view,
        replacePortal,
        createNodeView,
      });

      if (signal?.aborted) {
        return;
      }

      /**
       * The view's state may have changed, making our current transaction
       * invalid – so lets start again.
       *
       * @todo probably better way of dealing with this
       */
      if (view.state !== state || prosemirrorSetup.current !== setup) {
        return updateContents(contents, signal);
      }

      view.dispatch(tr);
    },
    [replacePortal]
  );

  useLayoutEffect(() => {
    /**
     * Setting this function to global state as a shortcut to call it from deep
     * within prosemirror.
     *
     * @todo come up with a better solution for this
     *
     * Note that this save handler only handles saving for things that
     * prosemirror controls – i.e, the contents of prosemirror text nodes /
     * the order of / the creation of / ther deletion of blocks (noting that
     * changing block type is a deletion & a creation at once). Saves can be
     * handled directly by the blocks implementation using the update callbacks
     */
    let saveQueue = Promise.resolve();
    (window as any).triggerSave = () => {
      if (collabEnabled) {
        return;
      }

      saveQueue = saveQueue
        .catch(() => {})
        .then(() => {
          if (!prosemirrorSetup.current) {
            return;
          }

          return updatePageMutation(
            accountId,
            pageId,
            metadataId,
            prosemirrorSetup.current.view.state,
            currentContents.current,
            currentEntityStoreValue.current,
            client
          ).then(() => {});
        });
    };
  }, [accountId, client, metadataId, pageId, updatePageContentsFn]);

  /**
   * This effect runs once and just sets up the prosemirror instance. It is not
   * responsible for setting the contents of the prosemirror document
   */
  useLayoutEffect(() => {
    const schema = createSchema();
    const node = root.current!;

    /**
     * We want to apply saves when Prosemirror loses focus (or is triggered
     * manually with cmd+s). However, interacting with the format tooltip
     * momentarily loses focus, so we want to wait a moment and cancel that
     * save if focus is regained quickly. The reason we only want to save when
     * losing focus is because the process of taking the response from a save
     * and updating the prosemirror tree with new contents can mess with the
     * cursor position.
     *
     * @todo make saves more frequent & seamless
     */
    const savePlugin = new Plugin({
      props: {
        handleDOMEvents: {
          keydown(view, evt) {
            // Manual save for cmd+s
            if (evt.key === "s" && evt.metaKey) {
              evt.preventDefault();
              (window as any).triggerSave?.();

              return true;
            }
            return false;
          },
          focus() {
            // Cancel the in-progress save
            clearCallback();
            return false;
          },
          blur: function () {
            // Trigger a cancellable save on blur
            deferCallback(() => (window as any).triggerSave());

            return false;
          },
        },
      },
    });

    /**
     * Lets see up prosemirror with an empty document, as another effect will
     * set its contents. Unfortunately all prosemirror documents have to
     * contain at least one child, so lets insert a special "blank" placeholder
     * child
     */
    const { view, connection } = renderPM(
      node,
      createInitialDoc(schema),
      { nodeViews: {} },
      replacePortal,
      [
        savePlugin,
        createMarksTooltip(replacePortal),
        createBlockSuggester(replacePortal),
      ],
      accountId,
      metadataId
    );

    prosemirrorSetup.current = { schema, view, connection: connection ?? null };

    return () => {
      // @todo how does this work with portals?
      node.innerHTML = "";
      prosemirrorSetup.current = null;
      connection?.close();
    };
  }, [accountId, clearCallback, deferCallback, metadataId, replacePortal]);

  /**
   * This effect is responsible for ensuring all the preloaded blocks are
   * defined in prosemirror
   */
  useLayoutEffect(() => {
    if (!prosemirrorSetup.current) {
      return;
    }

    const { view } = prosemirrorSetup.current;

    // @todo filter out already defined blocks
    for (const [componentId, meta] of Array.from(blocksMeta.entries())) {
      defineNewBlock(
        view.state.schema,
        meta.componentMetadata,
        meta.componentSchema,
        { view, replacePortal, createNodeView },
        componentId
      );
    }
  }, [blocksMeta, replacePortal]);

  /**
   * Whenever contents are updated, we want to sync them to the prosemirror
   * document, which is an async operation as it may involved defining new node
   * types (and fetching the metadata for them). Contents change whenever we
   * save (as we replace our already loaded contents with another request for
   * the contents, which ensures that blocks referencing the same entity are
   * all updated, and that empty IDs are properly filled (i.e, when creating a
   * new block)
   */
  useLayoutEffect(() => {
    const controller = new AbortController();

    if (!collabEnabled) {
      // @todo inline this function
      updateContents(contents, controller.signal).catch((err) =>
        console.error("Could not update page contents: ", err)
      );
    }

    return () => {
      controller.abort();
    };
  }, [replacePortal, updateContents, metadataId, contents]);

  return (
    <BlockMetaContext.Provider value={blocksMeta}>
      <EntityStoreContext.Provider value={entityStoreValue}>
        <div id="root" ref={root} />
        {portals}
      </EntityStoreContext.Provider>
    </BlockMetaContext.Provider>
  );
};
