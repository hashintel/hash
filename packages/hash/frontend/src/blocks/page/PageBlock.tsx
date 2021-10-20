import { useApolloClient } from "@apollo/client";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { createEntityStore } from "@hashintel/hash-shared/entityStore";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { nodeToEntityProperties } from "@hashintel/hash-shared/save";
import { current, isDraft, produce } from "immer";
import { Schema } from "prosemirror-model";
import { Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import React, {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import { v4 as uuid } from "uuid";
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

  const savedEntityStore = useMemo(
    () => createEntityStore(contents),
    [contents]
  );

  const defaultDraftEntityStore = Object.fromEntries(
    Object.values(savedEntityStore).map((entity) => {
      const draftId = uuid();
      return [draftId, { ...entity!, draftId }];
    })
  );
  const [draftEntityStore, setDraftEntityStore] = useState(
    defaultDraftEntityStore
  );

  let hasChanged = false;
  for (const savedEntityId of Object.keys(savedEntityStore)) {
    if (
      !Object.values(draftEntityStore).some(
        (entity) => entity.entityId === savedEntityId
      )
    ) {
      hasChanged = true;
    }
  }

  if (hasChanged) {
    setDraftEntityStore({ ...defaultDraftEntityStore, ...draftEntityStore });
  }

  const entityStoreValue = useMemo(
    () => ({ saved: savedEntityStore, draft: draftEntityStore }),
    [draftEntityStore, savedEntityStore]
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
      client,
      [
        new Plugin<unknown, Schema>({
          appendTransaction(_, __, state) {
            const prevDraft = currentEntityStoreValue.current.draft;
            let tr: Transaction<Schema> | undefined;

            const newDraft = produce(prevDraft, (draft) => {
              state.doc.descendants((node, pos) => {
                if (node.type === view.state.schema.nodes.entity) {
                  let draftId = node.attrs.draftId;
                  if (!draftId) {
                    if (node.attrs.entityId) {
                      const existingDraftId = Object.values(prevDraft).find(
                        (entity) => entity.entityId === node.attrs.entityId
                      )?.draftId;

                      if (!existingDraftId) {
                        // @todo fix this invariant
                        window.location.reload();
                        throw new Error(
                          "invariant: entity missing from saved entity store"
                        );
                      }

                      draftId = existingDraftId;
                    } else {
                      draftId = uuid();
                      draft[draftId] = {
                        draftId,
                        // @todo make this ok
                        entityId: null,
                      };
                    }

                    if (!tr) {
                      tr = state.tr;
                    }

                    tr.setNodeMarkup(pos, undefined, {
                      ...node.attrs,
                      draftId,
                    });
                  }

                  const draftEntity = Object.values(draft).find(
                    (entity) => entity.draftId === draftId
                  );

                  const child = node.firstChild;

                  if (child) {
                    const props = nodeToEntityProperties(child);
                    if (props) {
                      draftEntity.properties = props;
                    }
                  }
                }
              });
            });

            setDraftEntityStore(newDraft);

            return tr;
          },
        }),
      ]
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

  return (
    <BlockMetaContext.Provider value={blocksMeta}>
      <EntityStoreContext.Provider value={entityStoreValue}>
        <div id="root" ref={root} />
        {portals}
      </EntityStoreContext.Provider>
    </BlockMetaContext.Provider>
  );
};
