import { ApolloClient } from "@apollo/client";
import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { apiOrigin } from "@hashintel/hash-shared/environment";
import { entityStoreFromProsemirror } from "@hashintel/hash-shared/entityStorePlugin";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { updatePageMutation } from "@hashintel/hash-shared/save";
// import applyDevTools from "prosemirror-dev-tools";
import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createBlockSuggester } from "../../components/BlockSuggester/createBlockSuggester";
import { createFormatPlugins } from "../../components/MarksTooltip";
import { BlockView } from "./BlockView";
import { EditorConnection } from "./collab/EditorConnection";
import { Reporter } from "./collab/Reporter";
import { collabEnabled } from "./collabEnabled";
import { ComponentView } from "./ComponentView";
import styles from "./style.module.css";
import { RenderPortal } from "./usePortals";

const createSavePlugin = (
  accountId: string,
  pageEntityId: string,
  getLastSavedValue: () => BlockEntity[],
  client: ApolloClient<unknown>,
) => {
  let saveQueue = Promise.resolve<unknown>(null);

  const triggerSave = (view: EditorView<Schema>) => {
    if (collabEnabled) {
      return;
    }

    saveQueue = saveQueue
      .catch()
      .then(() =>
        updatePageMutation(
          accountId,
          pageEntityId,
          view.state.doc,
          getLastSavedValue(),
          entityStoreFromProsemirror(view.state).store,
          client,
        ),
      );
  };

  let timeout: ReturnType<typeof setTimeout> | null = null;

  return new Plugin<unknown, Schema>({
    props: {
      handleDOMEvents: {
        keydown(view, evt) {
          // Manual save for cmd+s
          if (evt.key === "s" && evt.metaKey) {
            evt.preventDefault();
            triggerSave(view);

            return true;
          }
          return false;
        },
        focus() {
          // Cancel the in-progress save
          if (timeout) {
            clearTimeout(timeout);
          }
          return false;
        },
        blur(view) {
          if (timeout) {
            clearTimeout(timeout);
          }

          timeout = setTimeout(() => triggerSave(view), 500);

          return false;
        },
      },
    },
  });
};

export const createEditorView = (
  renderNode: HTMLElement,
  renderPortal: RenderPortal,
  accountId: string,
  pageEntityId: string,
  preloadedBlocks: BlockMeta[],
  getLastSavedValue: () => BlockEntity[],
  contents: BlockEntity[],
  client: ApolloClient<unknown>,
) => {
  let manager: ProsemirrorSchemaManager;

  const plugins: Plugin<unknown, Schema>[] = [
    createSavePlugin(accountId, pageEntityId, getLastSavedValue, client),
    ...createFormatPlugins(renderPortal),
    createBlockSuggester(renderPortal, () => manager),
  ];

  const state = createProseMirrorState({ plugins });

  let connection: EditorConnection | null = null;

  const view = new EditorView<Schema>(renderNode, {
    state,
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
          contents
        );
      },
    },
    dispatchTransaction: collabEnabled
      ? (...args) => connection?.dispatchTransaction(...args)
      : undefined,
  });

  manager = new ProsemirrorSchemaManager(
    state.schema,
    view,
    (meta) => (node, editorView, getPos) => {
      if (typeof getPos === "boolean") {
        throw new Error("Invalid config for nodeview");
      }

      return new ComponentView(node, editorView, getPos, renderPortal, meta);
    },
  );

  if (collabEnabled) {
    connection = new EditorConnection(
      new Reporter(),
      `${apiOrigin}/collab-backend/${accountId}/${pageEntityId}`,
      view.state.schema,
      view,
      manager,
      plugins,
    );
  }

  view.dom.classList.add(styles.ProseMirror);

  for (const meta of preloadedBlocks) {
    manager.defineNewBlock(meta);
  }

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection, manager };
};
