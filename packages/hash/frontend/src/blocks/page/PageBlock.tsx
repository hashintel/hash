import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  VoidFunctionComponent,
} from "react";
import { Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { renderPM } from "./sandbox";
import { createMarksTooltip } from "../../components/MarksTooltip";
import { createBlockSuggester } from "../../components/BlockSuggester";
import { useBlockProtocolUpdate } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { useBlockProtocolInsertIntoPage } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolInsertIntoPage";
import { usePortals } from "./usePortals";
import { useDeferredCallback } from "./useDeferredCallback";
import { BlockMetaContext } from "../blockMeta";
import { createInitialDoc, createSchema } from "@hashintel/hash-shared/schema";
import {
  Block,
  BlockMeta,
  cachedPropertiesByEntity,
  cachedPropertiesByPosition,
  createEntityUpdateTransaction,
  defineNewBlock,
  invertedBlockPaths,
} from "@hashintel/hash-shared/sharedWithBackend";
import { collabEnabled, createNodeView } from "./tsUtils";
import { EditorConnection } from "./collab/collab";
import {
  MoveBlock,
  PageFieldsFragment,
  RemoveBlock,
  UpdateEntity,
  UpdatePageAction,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { EntityStoreContext } from "./EntityStoreContext";
import {
  createEntityStore,
  EntityStore,
  EntityStoreType,
  isBlockEntity,
} from "@hashintel/hash-shared/entityStore";
import { uniqBy } from "lodash";
import { BlockProtocolUpdatePayload } from "@hashintel/block-protocol";
import {
  InsertNewBlock,
  SystemTypeName,
  UpdatePageContentsMutation,
  UpdatePageContentsMutationVariables,
} from "../../graphql/apiTypes.gen";
import { useApolloClient, useMutation } from "@apollo/client";
import { updatePageContents } from "@hashintel/hash-shared/queries/page.queries";

type PageBlockProps = {
  contents: PageFieldsFragment["properties"]["contents"];
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

/**
 * @todo better name, move to shared package
 * @todo this needs to be able to handle multiple instances of the same block
 */
const calculateSaveOperations = (
  accountId: string,
  pageId: string,
  metadataId: string,
  // @todo type this properly
  state: EditorState,
  savedContents: PageFieldsFragment["properties"]["contents"],
  entityStore: EntityStore
) => {
  let schema = state.schema;
  let doc = state.doc;
  /**
   * @todo this needs to be typed – maybe we should use the prosemirror node
   *   APIs instead
   */
  const blocks = doc
    .toJSON()
    .content.filter((block: any) => block.type === "block")
    .flatMap((block: any) => block.content) as any[];

  const mappedBlocks = blocks.map((node: any, position) => {
    const nodeType = schema.nodes[node.type];
    // @todo type this properly – get this from somewhere else
    const meta = (nodeType as any).defaultAttrs
      .meta as Block["componentMetadata"];

    if (node.attrs.entityId) {
      cachedPropertiesByEntity[node.attrs.entityId] = node.attrs.properties;
    } else {
      cachedPropertiesByPosition[position] = node.attrs.properties;
    }

    const componentId = invertedBlockPaths[meta.url] ?? meta.url;
    const savedEntity = (
      entityStore as Record<string, EntityStoreType | undefined>
    )[node.attrs.entityId];

    const childEntityId =
      savedEntity && isBlockEntity(savedEntity)
        ? savedEntity.properties.entity.metadataId
        : null ?? null;

    // @todo use parent node to get this childEntityId
    const savedChildEntity = childEntityId ? entityStore[childEntityId] : null;

    let entity;
    if (schema.nodes[node.type].isTextblock) {
      entity = {
        type: "Text" as const,
        id: savedChildEntity?.metadataId ?? null,
        versionId: savedChildEntity?.id ?? null,
        accountId: savedChildEntity?.accountId ?? null,
        properties: {
          texts:
            node.content
              ?.filter((child: any) => child.type === "text")
              .map((child: any) => ({
                text: child.text,
                bold:
                  child.marks?.some((mark: any) => mark.type === "strong") ??
                  false,
                italics:
                  child.marks?.some((mark: any) => mark.type === "em") ?? false,
                underline:
                  child.marks?.some(
                    (mark: any) => mark.type === "underlined"
                  ) ?? false,
              })) ?? [],
        },
      };
    } else {
      const childEntityVersionId = savedChildEntity?.id ?? null;
      const childEntityAccountId = savedChildEntity?.accountId ?? null;

      entity = {
        type: "UnknownEntity" as const,
        id: childEntityId,
        versionId: childEntityVersionId,
        accountId: childEntityAccountId,
      };
    }

    return {
      entityId: savedEntity?.metadataId ?? null,
      accountId: savedEntity?.accountId ?? accountId,
      versionId: savedEntity?.id ?? null,
      type: "Block",
      position,
      properties: {
        componentId,
        entity,
      },
    };
  });

  /**
   * Once we have a list of blocks, we need to divide the list of blocks into
   * new ones and updated ones, as they require different queries to handle
   */
  const existingBlockIds = new Set(
    savedContents.map((block) => block.metadataId)
  );

  const currentBlockIds = new Set(mappedBlocks.map((block) => block.entityId));

  const isBlockNew = (block: typeof mappedBlocks[number]) =>
    !block.entityId || !existingBlockIds.has(block.entityId);

  const existingBlocks = mappedBlocks.filter((block) => !isBlockNew(block));

  const removedBlocks = savedContents
    .map((block, position) => [block, position] as const)
    .filter(([block]) => !currentBlockIds.has(block.metadataId));

  const removedBlocksInputs = removedBlocks.map(
    ([, position]): RemoveBlock => ({ position })
  );

  const removedBlocksPositions = new Set(
    removedBlocksInputs.map((block) => block.position)
  );

  const savedContentsWithoutRemovedBlocks = savedContents.filter(
    (_, position) => !removedBlocksPositions.has(position)
  );

  const movements: MoveBlock[] = [];
  const savedContentsWithoutRemovedBlocksWithMovements = [
    ...savedContentsWithoutRemovedBlocks,
  ];

  const mappedBlocksWithoutNewBlocks = mappedBlocks.filter(
    (block) => !isBlockNew(block)
  );

  for (
    let position = 0;
    position < savedContentsWithoutRemovedBlocksWithMovements.length;
    position++
  ) {
    const block = savedContentsWithoutRemovedBlocksWithMovements[position];
    const positionInMappedBlocks = mappedBlocksWithoutNewBlocks.findIndex(
      (otherBlock) => otherBlock.entityId === block.metadataId
    );

    if (positionInMappedBlocks < 0) {
      throw new Error(
        "invariant: found removed block whilst calculating movements"
      );
    }

    if (position !== positionInMappedBlocks) {
      movements.push({
        currentPosition: position,
        newPosition: positionInMappedBlocks,
      });
      savedContentsWithoutRemovedBlocksWithMovements.splice(position, 1);
      savedContentsWithoutRemovedBlocksWithMovements.splice(
        positionInMappedBlocks,
        0,
        block
      );
    }
  }

  const insertBlockOperation: InsertNewBlock[] = [];

  for (let position = 0; position < mappedBlocks.length; position++) {
    const block = mappedBlocks[position];

    if (!isBlockNew(block)) {
      continue;
    }

    insertBlockOperation.push({
      position,
      componentId: block.properties.componentId,
      accountId: block.accountId,
      entityProperties: block.properties.entity.properties,
      systemTypeName: SystemTypeName.Text,
    });
  }

  /**
   * An updated block also contains an updated entity, so we need to create a
   * list of entities that we need to post updates to via GraphQL
   */
  const updatedEntities = existingBlocks.flatMap((existingBlock) => {
    const block = {
      type: "Block",
      id: existingBlock.entityId,
      accountId: existingBlock.accountId,
      properties: {
        componentId: existingBlock.properties.componentId,
        entityId: existingBlock.properties.entity.versionId,
        accountId: existingBlock.properties.entity.accountId,
      },
    };

    const contentNode = savedContents.find(
      (existingBlock) => existingBlock.metadataId === block.id
    );

    const blocks = [];

    if (block.properties.componentId !== contentNode?.properties.componentId) {
      blocks.push(block);
    }

    if (existingBlock.properties.entity.type === "Text") {
      const texts =
        contentNode && "textProperties" in contentNode.properties.entity
          ? contentNode.properties.entity.textProperties.texts
          : undefined;

      if (
        !contentNode ||
        contentNode?.properties.entity.metadataId !==
          existingBlock.properties.entity.id ||
        existingBlock.properties.entity.properties.texts.length !==
          texts?.length ||
        // @todo remove any cast
        (existingBlock.properties.entity.properties.texts as any[]).some(
          (text: any, idx: number) => {
            const existingText = texts?.[idx];

            /**
             * Really crude way of working out if any properties we care about
             * have changed – we need a better way of working out which text
             * entities need an update
             */
            return (
              !existingText ||
              text.text !== existingText.text ||
              text.bold !== existingText.bold ||
              text.underline !== existingText.underline ||
              text.italics !== existingText.italics
            );
          }
        )
      ) {
        blocks.push(existingBlock.properties.entity);
      }
    }

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
    return uniqBy(blocks, "id");
  });

  const updatedEntitiesPayload = updatedEntities
    .filter(
      <T extends { id: string | null }>(
        entity: T
      ): entity is T & { id: string } =>
        /**
         * This had been setup to do something special in the case that you're
         * converting from text blocks to non-text blocks (or vice versa, not
         * sure) but it hasn't work for a while and making this strongly typed
         * is showing it as an error. I'm commenting this out, but we do need
         * to figure this one out
         *
         * @see https://github.com/hashintel/dev/blob/664be1e740cbad694f0b76b96198fa45cc8232fc/packages/hash/frontend/src/blocks/page/PageBlock.tsx#L283
         * @see https://app.asana.com/0/1200211978612931/1200962726214259/f
         */
        // (entity.properties.entityId ||
        //   entity.properties.entityTypeName !== "Text") &&
        !!entity.id
    )
    .map(
      (entity): BlockProtocolUpdatePayload<any> => ({
        entityId: entity.id,
        data: entity.properties,
        accountId: entity.accountId,
      })
    );

  const updatedEntitiesOperations = updatedEntitiesPayload.map(
    (payload): UpdateEntity => {
      if (!payload.accountId) {
        throw new Error("invariant: all updated entities must have account id");
      }

      return {
        entityId: payload.entityId,
        accountId: payload.accountId,
        properties: payload.data,
      };
    }
  );

  const operations: UpdatePageAction[] = [
    ...removedBlocksInputs.map((input) => ({ removeBlock: input })),
    ...movements.map((movement) => ({ moveBlock: movement })),
    ...insertBlockOperation.map((operation) => ({ insertNewBlock: operation })),
    ...updatedEntitiesOperations.map((operation) => ({
      updateEntity: operation,
    })),
  ];

  return operations;
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
          const { view } = prosemirrorSetup.current;
          const { state } = view;
          const operations = calculateSaveOperations(
            accountId,
            pageId,
            metadataId,
            state,
            currentContents.current,
            currentEntityStoreValue.current
          );
          const promise = updatePageContentsFn({
            variables: {
              actions: operations,
              accountId: accountId,
              entityId: metadataId,
            },
          });

          return promise
            .then(() => client.reFetchObservableQueries())
            .then(() => {});
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
