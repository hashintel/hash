import { useApolloClient } from "@apollo/client";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { createEntityStore } from "@hashintel/hash-shared/entityStore";
import {
  createEntityUpdateTransaction,
  defineNewBlock,
} from "@hashintel/hash-shared/prosemirror";
import { updatePageMutation } from "@hashintel/hash-shared/save";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, {
  useLayoutEffect,
  useMemo,
  useRef,
  VoidFunctionComponent,
} from "react";
import { BlockMetaContext } from "../blockMeta";
import { EditorConnection } from "./collab/EditorConnection";
import { createEditorView } from "./createEditorView";
import { EntityStoreContext } from "./EntityStoreContext";
import { collabEnabled, defineNodeView } from "./tsUtils";
import { usePortals } from "./usePortals";

type PageBlockProps = {
  contents: BlockEntity[];
  blocksMeta: Map<string, BlockMeta>;
  accountId: string;
  entityId: string;
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
  accountId,
  entityId,
}) => {
  const root = useRef<HTMLDivElement>(null);
  const client = useApolloClient();

  const [portals, replacePortal] = usePortals();

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
            entityId,
            prosemirrorSetup.current.view.state.doc,
            currentContents.current,
            currentEntityStoreValue.current,
            client
          ).then(() => {});
        });
    };
  }, [accountId, client, entityId]);

  /**
   * This effect runs once and just sets up the prosemirror instance. It is not
   * responsible for setting the contents of the prosemirror document
   */
  useLayoutEffect(() => {
    const node = root.current!;

    /**
     * Lets see up prosemirror with an empty document, as another effect will
     * set its contents. Unfortunately all prosemirror documents have to
     * contain at least one child, so lets insert a special "blank" placeholder
     * child
     */
    const { view, connection } = createEditorView(
      node,
      replacePortal,
      accountId,
      entityId,
      () => currentEntityStoreValue.current
    );

    prosemirrorSetup.current = {
      schema: view.state.schema,
      view,
      connection: connection ?? null,
    };

    return () => {
      // @todo how does this work with portals?
      node.innerHTML = "";
      prosemirrorSetup.current = null;
      connection?.close();
    };
  }, [accountId, entityId, replacePortal]);

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
        defineNodeView(view, replacePortal),
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
      (async function updateContents(
        updatedContents: BlockEntity[],
        signal?: AbortSignal
      ): Promise<void> {
        const setup = prosemirrorSetup.current;
        if (!setup) {
          return;
        }

        const { view } = setup;

        const state = view.state;

        const tr = await createEntityUpdateTransaction(
          state,
          updatedContents,
          defineNodeView(view, replacePortal)
        );

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
          return updateContents(updatedContents, signal);
        }

        view.dispatch(tr);
      })(contents, controller.signal).catch((err) =>
        console.error("Could not update page contents: ", err)
      );
    }

    return () => {
      controller.abort();
    };
  }, [replacePortal, entityId, contents]);

  return (
    <BlockMetaContext.Provider value={blocksMeta}>
      <EntityStoreContext.Provider value={entityStoreValue}>
        <div id="root" ref={root} />
        {portals}
      </EntityStoreContext.Provider>
    </BlockMetaContext.Provider>
  );
};
