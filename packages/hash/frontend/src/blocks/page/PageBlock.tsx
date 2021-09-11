import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  VoidFunctionComponent,
} from "react";
import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createFormatPlugin, renderPM } from "./sandbox";
import { useBlockProtocolUpdate } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdate";
import { useBlockProtocolInsertIntoPage } from "../../components/hooks/blockProtocolFunctions/useBlockProtocolInsertIntoPage";
import { usePortals } from "./usePortals";
import { useDeferredCallback } from "./useDeferredCallback";
import { BlockMetaContext } from "../blockMeta";
import { createInitialDoc, createSchema } from "@hashintel/hash-shared/schema";
import {
  BlockMeta,
  cachedPropertiesByEntity,
  calculateSavePayloads,
  createEntityUpdateTransaction,
} from "@hashintel/hash-shared/sharedWithBackend";
import { defineNewBlock } from "@hashintel/hash-shared/sharedWithBackendJs";
import { collabEnabled, createNodeView } from "./tsUtils";
import { EditorConnection } from "./collab/collab";
import { PageFieldsFragment } from "@hashintel/hash-shared/graphql/apiTypes.gen";
import { EntityListContext } from "./EntityListContext";
import { createEntityList } from "@hashintel/hash-shared/entityList";

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
 * The naming of this as a "Block" is… interesting, considering it doesn't really work like a Block. It would be cool
 * to somehow detach the process of rendering child blocks from this and have a renderer, but it seems tricky to do that
 */
export const PageBlock: VoidFunctionComponent<PageBlockProps> = ({
  contents,
  blocksMeta,
  pageId,
  accountId,
  metadataId,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const { insert } = useBlockProtocolInsertIntoPage();
  const { update } = useBlockProtocolUpdate();

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
   * There's a potential minor problem here which is that entity list is updated before prosemirror's tree has yet
   * updated to apply the new contents, meaning they can become out of sync. This shouldn't be a problem unless/until
   * the ids used to link between PM and entity list are inconsistent between saves (i.e, if they're versioned linked).
   * This is because any deletions from contents are driven by PM, meaning that by the time they disappear from the
   * entity list, they've already been deleted from the PM tree by the user
   */
  const entityList = useMemo(() => createEntityList(contents), [contents]);

  const currentEntityList = useRef(entityList);
  useLayoutEffect(() => {
    currentEntityList.current = entityList;
  }, [entityList]);

  const updateContents = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const setup = prosemirrorSetup.current;
      if (!setup) {
        return;
      }

      const { view } = setup;

      const state = view.state;

      const tr = await createEntityUpdateTransaction(
        state,
        currentContents.current,
        {
          view,
          replacePortal,
          createNodeView,
        }
      );

      if (signal?.aborted) {
        return;
      }

      /**
       * The view's state may have changed, making our current transaction invalid – so lets start again.
       *
       * @todo probably better way of dealing with this
       */
      if (view.state !== state || prosemirrorSetup.current !== setup) {
        return updateContents(signal);
      }

      view.dispatch(tr);
    },
    [replacePortal]
  );

  useLayoutEffect(() => {
    /**
     * Setting this function to global state as a shortcut to call it from deep within prosemirror.
     *
     * @todo come up with a better solution for this
     *
     * Note that this save handler only handles saving for things that prosemirror controls – i.e, the contents of
     * prosemirror text nodes / the order of / the creation of / ther deletion of blocks (noting that changing block
     * type is a deletion & a creation at once). Saves can be handled directly by the blocks implementation using the
     * update callbacks
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

          const { updatedEntitiesPayload, pageUpdatedPayload, insertPayloads } =
            calculateSavePayloads(
              accountId,
              pageId,
              metadataId,
              state.schema,
              state.doc,
              currentContents.current,
              currentEntityList.current
            );

          /**
           * Building a promise here that updates the page block with the list of block ids it contains (if necessary, i.e,
           * when you delete or re-order blocks, and then calls insert for each new block, before updating blocks that need
           * to be updated. Ideally we would handle all of this in one query
           *
           * @todo improve this
           */
          return (
            insertPayloads
              .reduce(
                (promise, insertPayload) =>
                  promise.catch(() => {}).then(() => insert(insertPayload)),
                pageUpdatedPayload
                  ? update([pageUpdatedPayload])
                  : Promise.resolve()
              )
              /**
               * Entity updates temporary sequential due to issue in Apollo – we'll be replacing all of this with a
               * single atomic query anyway so this is a fine compromise for now
               *
               * @see https://hashintel.slack.com/archives/C022217GAHF/p1631541550015000
               */
              .then(() =>
                updatedEntitiesPayload.reduce(
                  (promise, payload) =>
                    promise.catch(() => {}).then(() => update([payload])),
                  Promise.resolve()
                )
              )
              .catch(() => {})
              // @todo remove this timeout
              .then(() => {
                return new Promise<void>((resolve) => {
                  setTimeout(() => {
                    resolve();
                  }, 250);
                });
              })
              .then(() => {
                return updateContents();
              })
          );
        });
    };
  }, [accountId, insert, metadataId, pageId, update, updateContents]);

  /**
   * This effect runs once and just sets up the prosemirror instance. It is not responsible for setting the contents of
   * the prosemirror document
   */
  useLayoutEffect(() => {
    const schema = createSchema();
    const node = root.current!;

    /**
     * We want to apply saves when Prosemirror loses focus (or is triggered manually with cmd+s). However, interacting
     * with the format tooltip momentarily loses focus, so we want to wait a moment and cancel that save if focus is
     * regained quickly. The reason we only want to save when losing focus is because the process of taking the response
     * from a save and updating the prosemirror tree with new contents can mess with the cursor position.
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
     * Lets see up prosemirror with an empty document, as another effect will set its contents. Unfortunately all
     * prosemirror documents have to contain at least one child, so lets insert a special "blank" placeholder child
     */
    const { view, connection } = renderPM(
      node,
      createInitialDoc(schema),
      { nodeViews: {} },
      replacePortal,
      [savePlugin, createFormatPlugin(replacePortal)],
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
   * This effect is responsible for ensuring all the preloaded blocks (currently just paragraph) are defined in
   * prosemirror
   */
  useLayoutEffect(() => {
    if (!prosemirrorSetup.current) {
      return;
    }

    const { view } = prosemirrorSetup.current;

    // @todo filter out already defined blocks
    for (const [componentUrl, meta] of Array.from(blocksMeta.entries())) {
      defineNewBlock(
        view.state.schema,
        meta.componentMetadata,
        meta.componentSchema,
        { view, replacePortal, createNodeView },
        componentUrl
      );
    }
  }, [blocksMeta, replacePortal]);

  /**
   * Whenever contents are updated, we want to sync them to the prosemirror document, which is an async operation as it
   * may involved defining new node types (and fetching the metadata for them). Contents change whenever we save (as we
   * replace our already loaded contents with another request for the contents, which ensures that blocks referencing
   * the same entity are all updated, and that empty IDs are properly filled (i.e, when creating a new block)
   *
   * @todo fix when getPage queries are triggered rather than relying on a hook that doesn't actually update from
   *       contents (because of the laddering problem)
   */
  useLayoutEffect(() => {
    const controller = new AbortController();

    if (!collabEnabled) {
      updateContents(controller.signal).catch((err) =>
        console.error("Could not update page contents: ", err)
      );
    }

    return () => {
      controller.abort();
    };
  }, [replacePortal, updateContents, metadataId]);

  return (
    <BlockMetaContext.Provider value={blocksMeta}>
      <EntityListContext.Provider value={entityList}>
        <div id="root" ref={root} />
        {portals}
      </EntityListContext.Provider>
    </BlockMetaContext.Provider>
  );
};
