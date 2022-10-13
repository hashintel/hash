import { HashBlock } from "@hashintel/hash-shared/blocks";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { debounce } from "lodash";
// import { apiOrigin } from "@hashintel/hash-shared/environment";
import { ProsemirrorManager } from "@hashintel/hash-shared/ProsemirrorManager";
import { EditorView } from "prosemirror-view";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { save } from "@hashintel/hash-shared/save";
import { ApolloClient } from "@apollo/client";
import {
  addEntityStoreAction,
  entityStorePluginState,
} from "@hashintel/hash-shared/entityStorePlugin";

import applyDevTools from "prosemirror-dev-tools";
import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { RefObject } from "react";
import { LoadingView } from "./LoadingView";
import { BlockView } from "./BlockView";
import { EditorConnection } from "./collab/EditorConnection";
import { ComponentView } from "./ComponentView";
import { createErrorPlugin } from "./createErrorPlugin";
import { createFormatPlugins } from "./createFormatPlugins";
import { createPlaceholderPlugin } from "./createPlaceholderPlugin/createPlaceholderPlugin";
import { createSuggester } from "./createSuggester/createSuggester";
import { createFocusPageTitlePlugin } from "./focusPageTitlePlugin";
import styles from "./style.module.css";
import { RenderPortal } from "./usePortals";
import { createTextEditorView } from "./createTextEditorView";

export type BlocksMap = Record<string, HashBlock>;

const createSavePlugin = (
  ownedById: string,
  pageEntityId: string,
  client: ApolloClient<unknown>,
) => {
  let saveQueue = Promise.resolve<unknown>(null);

  const triggerSave = (view: EditorView<Schema>) => {
    saveQueue = saveQueue.catch().then(async () => {
      const [newContents, newDraftToEntityId] = await save(
        client,
        ownedById,
        pageEntityId,
        view.state.doc,
        entityStorePluginState(view.state).store,
      );

      const { tr } = view.state;
      addEntityStoreAction(view.state, tr, {
        type: "mergeNewPageContents",
        payload: {
          blocks: newContents,
          presetDraftIds: newDraftToEntityId,
        },
      });

      view.updateState(view.state.apply(tr));
    });
  };

  const minWaitTime = 400;
  const maxWaitTime = 1200;

  // Saving happens through a debounced write operation
  const writeDebounce = debounce(
    (view: EditorView<Schema>) => {
      triggerSave(view);
    },
    minWaitTime,
    { maxWait: maxWaitTime },
  );

  return new Plugin<unknown, Schema>({
    view: (_viewOnCreation: EditorView<Schema>) => {
      return {
        update: (view, prevState) => {
          if (view.state.doc !== prevState.doc) {
            // If the document changes between updates, we issue a debounced update.
            writeDebounce(view);
          }
        },
        destroy: () => {
          writeDebounce.cancel();
        },
      };
    },
    props: {
      handleDOMEvents: {
        keydown(view, evt) {
          // Manual save for cmd+s or ctrl+s
          if (evt.key === "s" && (evt.metaKey || evt.ctrlKey)) {
            evt.preventDefault();
            writeDebounce.cancel();
            triggerSave(view);

            return true;
          }
          return false;
        },
        blur(view) {
          writeDebounce.cancel();
          triggerSave(view);
          return false;
        },
      },
    },
  });
};

/**
 * An editor view manages the DOM structure that represents an editable document.
 * @see https://prosemirror.net/docs/ref/#view.EditorView
 */
export const createEditorView = (
  renderNode: HTMLElement,
  renderPortal: RenderPortal,
  accountId: string,
  pageEntityId: string,
  blocks: BlocksMap,
  readonly: boolean,
  pageTitleRef: RefObject<HTMLTextAreaElement>,
  getLastSavedValue: () => BlockEntity[],
  client: ApolloClient<unknown>,
) => {
  let manager: ProsemirrorManager;

  const [errorPlugin, _onError] = createErrorPlugin(renderPortal);

  const plugins: Plugin<unknown, Schema>[] = [
    createSavePlugin(accountId, pageEntityId, client),
    ...createFormatPlugins(renderPortal),
    createSuggester(renderPortal, accountId, renderNode, () => manager),
    createPlaceholderPlugin(renderPortal),
    errorPlugin,
    createFocusPageTitlePlugin(pageTitleRef),
  ];

  const state = createProseMirrorState({ accountId, plugins });

  let connection: EditorConnection | undefined;

  const view = createTextEditorView(
    state,
    renderNode,
    renderPortal,
    accountId,
    {
      nodeViews: {
        // Reason for adding `_decorations`:
        // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/57384#issuecomment-1018936089
        block(currentNode, currentView, getPos, _decorations) {
          if (typeof getPos === "boolean") {
            throw new Error("Invalid config for nodeview");
          }
          return new BlockView(
            currentNode,
            currentView,
            getPos,
            renderPortal,
            manager,
            renderNode,
          );
        },
        // Reason for adding unused params e.g. `_decorations`:
        // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/57384#issuecomment-1018936089
        loading(currentNode, _currentView, _getPos, _decorations) {
          return new LoadingView(currentNode, renderPortal);
        },
      },
      editable: () => !readonly,
    },
  );

  manager = new ProsemirrorManager(
    state.schema,
    accountId,
    view,
    // Reason for adding `_decorations`:
    // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/57384#issuecomment-1018936089
    (block) => (node, editorView, getPos, _decorations) => {
      if (typeof getPos === "boolean") {
        throw new Error("Invalid config for nodeview");
      }

      return new ComponentView(
        node,
        editorView,
        getPos,
        renderPortal,
        block,
        manager,
      );
    },
  );

  void manager.loadPage(state, getLastSavedValue()).then((tr) => {
    view.updateState(state.apply(tr));
  });

  /**
   * @todo the collab editor connection is disabled currently.
   *   see https://app.asana.com/0/0/1203099452204542/f
   
  connection = new EditorConnection(
    `${apiOrigin}/collab-backend/${accountId}/${pageEntityId}`,
    view.state.schema,
    view,
    manager,
    plugins,
    accountId,
    () => {
      view.dispatch(onError(view.state.tr));
    },
  );
  */

  view.dom.classList.add(styles.ProseMirror!);
  // Prevent keyboard navigation on the editor
  view.dom.setAttribute("tabIndex", "-1");

  // prosemirror will use the first node type (per group) for auto-creation.
  // we want this to be the paragraph node type.
  const blocksArray = Object.values(blocks);

  const paragraphBlock = blocksArray.find(
    (block) =>
      block.meta.componentId ===
      "https://blockprotocol.org/blocks/@hash/paragraph",
  );

  if (!paragraphBlock) {
    throw new Error("missing required block-type paragraph");
  }

  /** note that {@link ProsemirrorManager#defineBlock} is idempotent */
  manager.defineBlock(paragraphBlock);
  for (const block of blocksArray) {
    manager.defineBlock(block);
  }

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection, manager };
};
