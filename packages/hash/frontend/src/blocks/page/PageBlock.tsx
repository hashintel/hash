import { useApolloClient } from "@apollo/client";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { useRouter } from "next/router";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, { useLayoutEffect, useRef, VoidFunctionComponent } from "react";
import { BlockMetaContext } from "../blockMeta";
import { EditorConnection } from "./collab/EditorConnection";
import { collabEnabled } from "./collabEnabled";
import { createEditorView } from "./createEditorView";
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
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const client = useApolloClient();

  const [portals, renderPortal] = usePortals();

  const prosemirrorSetup = useRef<null | {
    view: EditorView<Schema>;
    connection: EditorConnection | null;
    manager: ProsemirrorSchemaManager;
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
    const { view, connection, manager } = createEditorView(
      node,
      renderPortal,
      accountId,
      entityId,
      Array.from(blocksMeta.values()),
      () => currentContents.current,
      client,
    );

    prosemirrorSetup.current = {
      view,
      connection: connection ?? null,
      manager,
    };

    return () => {
      // @todo how does this work with portals?
      node.innerHTML = "";
      prosemirrorSetup.current = null;
      connection?.close();
    };
  }, [accountId, blocksMeta, client, entityId, renderPortal]);

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
        signal?: AbortSignal,
      ): Promise<void> {
        const setup = prosemirrorSetup.current;
        if (!setup) {
          return;
        }
        const { state } = setup.view;
        const tr = await setup.manager.createEntityUpdateTransaction(
          updatedContents,
          state,
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
        if (setup.view.state !== state || prosemirrorSetup.current !== setup) {
          return updateContents(updatedContents, signal);
        }

        setup.view.dispatch(tr);
      })(contents, controller.signal).catch((err) =>
        console.error("Could not update page contents: ", err),
      );
    }

    return () => {
      controller.abort();
    };
  }, [contents]);

  return (
    <BlockMetaContext.Provider value={blocksMeta}>
      <div id="root" ref={root} />
      {portals}
    </BlockMetaContext.Provider>
  );
};
