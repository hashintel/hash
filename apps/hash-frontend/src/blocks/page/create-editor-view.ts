import { ApolloClient } from "@apollo/client";
import {
  HashBlock,
  paragraphBlockComponentId,
} from "@local/hash-isomorphic-utils/blocks";
import { createProseMirrorState } from "@local/hash-isomorphic-utils/create-prose-mirror-state";
import { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import {
  addEntityStoreAction,
  entityStorePluginState,
} from "@local/hash-isomorphic-utils/entity-store-plugin";
// import { apiOrigin } from "@local/hash-graphql-shared/environment";
import { ProsemirrorManager } from "@local/hash-isomorphic-utils/prosemirror-manager";
import { save } from "@local/hash-isomorphic-utils/save";
import { AccountId, EntityId, OwnedById } from "@local/hash-subgraph/src/types";
import { debounce } from "lodash";
// import applyDevTools from "prosemirror-dev-tools";
import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { RefObject } from "react";

import { RenderPortal } from "./block-portals";
import { BlockView } from "./block-view";
import { EditorConnection } from "./collab/editor-connection";
import { ComponentView } from "./component-view";
import { createErrorPlugin } from "./create-error-plugin";
import { createFormatPlugins } from "./create-format-plugins";
import { createPlaceholderPlugin } from "./create-placeholder-plugin/create-placeholder-plugin";
import { createSuggester } from "./create-suggester/create-suggester";
import { createTextEditorView } from "./create-text-editor-view";
import { createFocusPageTitlePlugin } from "./focus-page-title-plugin";
import { LoadingView } from "./loading-view";
import styles from "./style.module.css";

export type BlocksMap = Record<string, HashBlock>;

const createSavePlugin = (
  ownedById: OwnedById,
  pageEntityId: EntityId,
  client: ApolloClient<unknown>,
) => {
  let saveQueue = Promise.resolve<unknown>(null);

  const triggerSave = (view: EditorView) => {
    saveQueue = saveQueue.catch().then(async () => {
      const [newContents, newDraftToEntityId] = await save(
        client,
        ownedById,
        pageEntityId,
        view.state.doc,
        entityStorePluginState(view.state).store,
      );

      if (!view.isDestroyed) {
        const { tr } = view.state;
        addEntityStoreAction(view.state, tr, {
          type: "mergeNewPageContents",
          payload: {
            blocks: newContents,
            presetDraftIds: newDraftToEntityId,
          },
        });

        view.dispatch(tr);
      }
    });
  };

  let latestView: EditorView | null = null;

  let interval: ReturnType<typeof setInterval> | void;

  const minWaitTime = 400;
  const maxWaitTime = 2000;

  const idleSave = () => {
    if (!interval) {
      interval = setInterval(() => {
        if (latestView) {
          triggerSave(latestView);
        }
      }, maxWaitTime);
    }
  };

  // Saving happens through a debounced write operation
  const writeDebounce = debounce(() => {
    if (latestView) {
      triggerSave(latestView);
    }
  }, minWaitTime);

  return new Plugin<unknown>({
    view: (_viewOnCreation: EditorView) => {
      return {
        update: (view, prevState) => {
          latestView = view;
          if (view.state.doc !== prevState.doc) {
            if (interval) {
              interval = clearInterval(interval);
            }
            writeDebounce();
          } else {
            idleSave();
          }
        },
        destroy: () => {
          if (interval) {
            interval = clearInterval(interval);
          }
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
          latestView = view;
          idleSave();
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
  accountId: AccountId,
  pageEntityId: EntityId,
  blocks: BlocksMap,
  readonly: boolean,
  pageTitleRef: RefObject<HTMLTextAreaElement>,
  getLastSavedValue: () => BlockEntity[],
  client: ApolloClient<unknown>,
) => {
  let manager: ProsemirrorManager;

  const [errorPlugin, _onError] = createErrorPlugin(renderPortal);

  const plugins: Plugin<unknown>[] = readonly
    ? []
    : [
        createSavePlugin(accountId as OwnedById, pageEntityId, client),
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
    accountId,
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
  const blocksArray = Object.values(blocks);

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

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection, manager };
};
