import { useApolloClient } from "@apollo/client";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { createEntityStore } from "@hashintel/hash-shared/entityStore";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { useRouter } from "next/router";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import { BlockMetaContext } from "../blockMeta";
import { EditorConnection } from "./collab/EditorConnection";
import { collabEnabled } from "./collabEnabled";
import { createEditorView } from "./createEditorView";
import { EntityStoreContext } from "./EntityStoreContext";
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
      () => currentEntityStoreValue.current,
      () => currentContents.current,
      client
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
        signal?: AbortSignal
      ): Promise<void> {
        const setup = prosemirrorSetup.current;
        if (!setup) {
          return;
        }
        const { state } = setup.view;
        const tr = await setup.manager.createEntityUpdateTransaction(
          updatedContents,
          state
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
        console.error("Could not update page contents: ", err)
      );
    }

    return () => {
      controller.abort();
    };
  }, [contents]);

  const [scrollingComplete, setScrollingComplete] = useState(false);
  const scrollIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const scrollTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    const routeHash = router.asPath.split("#")[1];

    const scrollCheck = () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }

      scrollTimerRef.current = setTimeout(() => {
        setScrollingComplete(true);
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current);
          document.removeEventListener("scroll", scrollCheck);
        }
      }, 300);
    };

    if (contents?.length > 0 && routeHash && !scrollingComplete) {
      scrollIntervalRef.current = setInterval(() => {
        const routeElement = document.getElementById(routeHash);

        if (routeElement) {
          document
            .getElementById(routeHash)
            ?.scrollIntoView({ behavior: "smooth" });

          document.addEventListener("scroll", scrollCheck);
        }
      }, 100);
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        document.removeEventListener("scroll", scrollCheck);
      }
    };
  });

  return (
    <BlockMetaContext.Provider value={blocksMeta}>
      <EntityStoreContext.Provider value={entityStoreValue}>
        <div id="root" ref={root} />
        {portals}
      </EntityStoreContext.Provider>
    </BlockMetaContext.Provider>
  );
};
