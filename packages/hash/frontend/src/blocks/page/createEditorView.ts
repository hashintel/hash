import { EntityStore } from "@hashintel/hash-shared/entityStore";
import { createProseMirrorState } from "@hashintel/hash-shared/prosemirror";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createBlockSuggester } from "../../components/BlockSuggester";
import { createMarksTooltip } from "../../components/MarksTooltip";
import { AsyncView } from "./AsyncView";
import { BlockView } from "./BlockView";
import { EditorConnection } from "./collab/EditorConnection";
import { Reporter } from "./collab/Reporter";
import { collabEnabled } from "./collabEnabled";
import { ComponentNodeView } from "./ComponentNodeView";
import styles from "./style.module.css";
import { ReplacePortal } from "./usePortals";

const createSavePlugin = () => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return new Plugin<unknown, Schema>({
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
          if (timeout) {
            clearTimeout(timeout);
          }
          return false;
        },
        blur() {
          if (timeout) {
            clearTimeout(timeout);
          }

          timeout = setTimeout(() => (window as any).triggerSave?.(), 500);

          return false;
        },
      },
    },
  });
};

export const createEditorView = (
  renderNode: HTMLElement,
  replacePortal: ReplacePortal,
  accountId: string,
  pageId: string,
  getEntityStore: () => EntityStore
) => {
  const plugins = [
    createSavePlugin(),
    createMarksTooltip(replacePortal),
    createBlockSuggester(replacePortal),
  ];

  const state = createProseMirrorState({ plugins });

  let connection: EditorConnection | null = null;
  let manager: ProsemirrorSchemaManager;

  const view = new EditorView<Schema>(renderNode, {
    state,
    nodeViews: {
      async(currentNode, currentView, getPos) {
        if (typeof getPos === "boolean") {
          throw new Error("Invalid config for nodeview");
        }
        return new AsyncView(
          currentNode,
          currentView,
          getPos,
          manager,
          getEntityStore
        );
      },
      block(currentNode, currentView, getPos) {
        if (typeof getPos === "boolean") {
          throw new Error("Invalid config for nodeview");
        }
        return new BlockView(currentNode, currentView, getPos, replacePortal);
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

      return new ComponentNodeView(
        node,
        editorView,
        getPos,
        replacePortal,
        meta
      );
    }
  );

  if (collabEnabled) {
    connection = new EditorConnection(
      new Reporter(),
      `http://localhost:5001/collab-backend/${accountId}/${pageId}`,
      view.state.schema,
      view,
      manager,
      plugins
    );
  }

  view.dom.classList.add(styles.ProseMirror);

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection, manager };
};
