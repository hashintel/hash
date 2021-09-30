import { createProseMirrorState } from "@hashintel/hash-shared/sharedWithBackendJs";
import { DirectEditorProps, EditorView } from "prosemirror-view";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { ReplacePortals } from "@hashintel/hash-shared/sharedWithBackend";
import { Plugin } from "prosemirror-state";
import { AsyncView } from "./AsyncView";
import { BlockView } from "./BlockView";
import { collabEnabled } from "./tsUtils";
import { EditorConnection } from "./collab/collab";
import { Reporter } from "./collab/reporter";
import styles from "./style.module.css";

/**
 * @todo remove this function
 */
export const createEditorView = (
  node: HTMLElement,
  content: ProsemirrorNode<Schema>,
  viewProps: DirectEditorProps<Schema>,
  replacePortal: ReplacePortals,
  additionalPlugins: Plugin[],
  accountId: string,
  pageId: string
) => {
  const state = createProseMirrorState(
    content,
    replacePortal,
    additionalPlugins
  );

  let connection: EditorConnection | null = null;

  const view = new EditorView<Schema>(node, {
    state,
    nodeViews: {
      ...viewProps.nodeViews,
      async(currentNode, currentView, getPos) {
        if (typeof getPos === "boolean") {
          throw new Error("Invalid config for nodeview");
        }
        return new AsyncView(currentNode, currentView, getPos, replacePortal);
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

  if (collabEnabled) {
    connection = new EditorConnection(
      new Reporter(),
      `http://localhost:5001/collab-backend/${accountId}/${pageId}`,
      view.state.schema,
      view,
      replacePortal,
      additionalPlugins
    );
  }

  view.dom.classList.add(styles.ProseMirror);

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection };
};
