import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { apiOrigin } from "@hashintel/hash-shared/environment";
import { ProsemirrorNode } from "@hashintel/hash-shared/node";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
// import applyDevTools from "prosemirror-dev-tools";
import { Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { BlockView } from "./BlockView";
import { EditorConnection } from "./collab/EditorConnection";
import { Reporter } from "./collab/Reporter";
import { ComponentView } from "./ComponentView";
import { createFormatPlugins } from "./createFormatPlugins";
import { createSuggester } from "./createSuggester/createSuggester";
import { MentionView } from "./MentionView/MentionView";
import styles from "./style.module.css";
import { RenderPortal } from "./usePortals";

export const createEditorView = (
  renderNode: HTMLElement,
  renderPortal: RenderPortal,
  accountId: string,
  pageEntityId: string,
  preloadedBlocks: BlockMeta[],
) => {
  let manager: ProsemirrorSchemaManager;

  const plugins: Plugin<unknown, Schema>[] = [
    ...createFormatPlugins(renderPortal),
    createSuggester(renderPortal, () => manager, accountId),
  ];

  const state = createProseMirrorState({ plugins });

  let connection: EditorConnection;

  const view = new EditorView<Schema>(renderNode, {
    state,

    /**
     * Prosemirror doesn't know to convert hard breaks into new line characters
     * in the plain text version of the clipboard when we copy out of the
     * editor. In the HTML version, they get converted as their `toDOM`
     * method instructs, but we have to use this for the plain text version.
     *
     * @todo find a way of not having to do this centrally
     * @todo look into whether this is needed for mentions and for links
     */
    clipboardTextSerializer: (slice) => {
      return slice.content.textBetween(
        0,
        slice.content.size,
        "\n\n",
        (node: ProsemirrorNode<Schema>) => {
          if (node.type === view.state.schema.nodes.hardBreak) {
            return "\n";
          }

          return "";
        },
      );
    },
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
        );
      },
      mention(currentNode, currentView, getPos) {
        if (typeof getPos === "boolean") {
          throw new Error("Invalid config for nodeview");
        }

        return new MentionView(
          currentNode,
          currentView,
          getPos,
          renderPortal,
          manager,
          accountId,
        );
      },
    },
    dispatchTransaction: (tr) =>
      connection?.dispatchTransaction(tr, connection?.state.version ?? 0),
  });

  manager = new ProsemirrorSchemaManager(
    state.schema,
    view,
    (meta) => (node, editorView, getPos) => {
      if (typeof getPos === "boolean") {
        throw new Error("Invalid config for nodeview");
      }

      return new ComponentView(
        node,
        editorView,
        getPos,
        renderPortal,
        meta,
        accountId,
      );
    },
  );

  connection = new EditorConnection(
    new Reporter(),
    `${apiOrigin}/collab-backend/${accountId}/${pageEntityId}`,
    view.state.schema,
    view,
    manager,
    plugins,
  );

  view.dom.classList.add(styles.ProseMirror);

  for (const meta of preloadedBlocks) {
    manager.defineNewBlock(meta);
  }

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection, manager };
};
