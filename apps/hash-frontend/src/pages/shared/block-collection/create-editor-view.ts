import type { ApolloClient } from "@apollo/client";
import type { ComponentIdHashBlockMap } from "@local/hash-isomorphic-utils/blocks";
import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import { createProseMirrorState } from "@local/hash-isomorphic-utils/create-prose-mirror-state";
import type { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import {
  addEntityStoreAction,
  entityStorePluginState,
} from "@local/hash-isomorphic-utils/entity-store-plugin";
// import { apiOrigin } from "@local/hash-isomorphic-utils/environment";
import { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import { save } from "@local/hash-isomorphic-utils/save";
import type { EntityId, OwnedById } from "@local/hash-subgraph";
import debounce from "lodash/debounce";
// import applyDevTools from "prosemirror-dev-tools";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { RefObject } from "react";

import type { SnackbarManager } from "../../../components/hooks/use-snackbar";
import type { RenderPortal } from "./block-portals";
import { BlockView } from "./block-view";
import type { EditorConnection } from "./collab/editor-connection";
import { ComponentView } from "./component-view";
import { createErrorPlugin } from "./create-error-plugin";
import { createFormatPlugins } from "./create-format-plugins";
import { createPlaceholderPlugin } from "./create-placeholder-plugin/create-placeholder-plugin";
import { createSuggester } from "./create-suggester/create-suggester";
import { createTextEditorView } from "./create-text-editor-view";
import { createFocusPageTitlePlugin } from "./focus-page-title-plugin";
import { LoadingView } from "./loading-view";
import styles from "./style.module.css";

const createSavePlugin = (
  ownedById: OwnedById,
  pageEntityId: EntityId,
  getBlocksMap: () => ComponentIdHashBlockMap,
  client: ApolloClient<unknown>,
  onSuccess: () => void,
  onError: (message: string) => void,
) => {
  let saveQueue = Promise.resolve<unknown>(null);
  const pluginKey = new PluginKey<unknown>("save");

  let view: EditorView;

  const triggerSave = () => {
    saveQueue = saveQueue.catch().then(async () => {
      try {
        const [newContents, newDraftToEntityId] = await save({
          apolloClient: client,
          ownedById,
          blockCollectionEntityId: pageEntityId,
          doc: view.state.doc,
          store: entityStorePluginState(view.state).store,
          getBlocksMap,
        });

        if (!view.isDestroyed) {
          const { tr } = view.state;
          addEntityStoreAction(view.state, tr, {
            type: "mergeNewPageContents",
            payload: {
              blocks: newContents,
              presetDraftIds: newDraftToEntityId,
            },
          });

          tr.setMeta(pluginKey, { skipSave: true });

          view.dispatch(tr);
        }

        onSuccess();
      } catch (err) {
        onError(`Could not save work: ${(err as Error).message}`);
      }
    });
  };

  const minWaitTime = 400;
  const maxWaitTime = 2000;

  // Saving happens through a debounced write operation
  const writeDebounce = debounce(triggerSave, minWaitTime, {
    maxWait: maxWaitTime,
  });

  return new Plugin<unknown>({
    state: {
      init: () => null,
      apply(tr, _, oldState, newState) {
        if (!tr.getMeta(pluginKey)?.skipSave) {
          if (
            oldState.doc !== newState.doc ||
            entityStorePluginState(oldState) !==
              entityStorePluginState(newState)
          ) {
            writeDebounce();
          }
        }
      },
    },
    view: () => ({
      update(currentView) {
        view = currentView;
      },
      destroy() {
        writeDebounce.cancel();
      },
    }),
    props: {
      handleDOMEvents: {
        keydown(_, evt) {
          // Manual save for cmd+s or ctrl+s
          if (evt.key === "s" && (evt.metaKey || evt.ctrlKey)) {
            evt.preventDefault();
            writeDebounce.cancel();
            triggerSave();

            return true;
          }
          return false;
        },
        blur() {
          writeDebounce.cancel();
          triggerSave();
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
export const createEditorView = (params: {
  autoFocus: boolean;
  client: ApolloClient<unknown>;
  getBlocksMap: () => ComponentIdHashBlockMap;
  getLastSavedValue: () => BlockEntity[];
  isCommentingEnabled: boolean;
  ownedById: OwnedById;
  pageEntityId: EntityId;
  pageTitleRef?: RefObject<HTMLTextAreaElement>;
  readonly: boolean;
  renderNode: HTMLElement;
  renderPortal: RenderPortal;
  snackbarManager: SnackbarManager;
}) => {
  const {
    autoFocus,
    client,
    getBlocksMap,
    getLastSavedValue,
    isCommentingEnabled,
    ownedById,
    pageEntityId,
    pageTitleRef,
    readonly,
    renderNode,
    renderPortal,
    snackbarManager,
  } = params;

  let manager: ProsemirrorManager;

  const [errorPlugin, _onError] = createErrorPlugin(renderPortal);

  const errorSnackbarKey = "editor-saving-error-snackbar";

  const plugins: Plugin<unknown>[] = readonly
    ? []
    : [
        ...createFormatPlugins(renderPortal),
        createSuggester(renderPortal, ownedById, renderNode, () => manager),
        createPlaceholderPlugin(renderPortal),
        errorPlugin,
        ...(pageTitleRef ? [createFocusPageTitlePlugin(pageTitleRef)] : []),
        createSavePlugin(
          ownedById,
          pageEntityId,
          getBlocksMap,
          client,
          () => snackbarManager.closeSnackbar(errorSnackbarKey),
          (message: string) =>
            snackbarManager.triggerSnackbar.error(message, {
              key: errorSnackbarKey,
              persist: true,
              preventDuplicate: true,
            }),
        ),
      ];

  const state = createProseMirrorState({ ownedById, plugins });

  let connection: EditorConnection | undefined;

  const view = createTextEditorView(
    state,
    renderNode,
    renderPortal,
    ownedById,
    {
      nodeViews: {
        block(currentNode, currentView, getPos) {
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
            readonly,
            isCommentingEnabled,
          );
        },
        loading(currentNode, _currentView, _getPos) {
          return new LoadingView(currentNode, renderPortal);
        },
      },
      editable: () => !readonly,
    },
  );

  manager = new ProsemirrorManager(
    state.schema,
    ownedById,
    view,
    (block) => (node, editorView, getPos) => {
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
        readonly,
        autoFocus,
      );
    },
  );

  void manager.loadPage(state, getLastSavedValue()).then((tr) => {
    view.dispatch(tr);
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
  const blocksArray = Object.values(getBlocksMap());

  if (blocksArray.length) {
    const paragraphBlock = blocksArray.find(
      (block) => block.meta.componentId === paragraphBlockComponentId,
    );

    if (!paragraphBlock) {
      throw new Error("missing required block-type paragraph");
    }

    /** note that {@link ProsemirrorManager#defineBlock} is idempotent */
    manager.defineBlock(paragraphBlock);
    for (const block of blocksArray) {
      manager.defineBlock(block);
    }
  }

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection, manager };
};
