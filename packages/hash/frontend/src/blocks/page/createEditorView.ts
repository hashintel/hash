import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { apiOrigin } from "@hashintel/hash-shared/environment";
import { ProsemirrorSchemaManager } from "@hashintel/hash-shared/ProsemirrorSchemaManager";
import applyDevTools from "prosemirror-dev-tools";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { BlockView } from "./BlockView";
import { EditorConnection } from "./collab/EditorConnection";
import { ComponentView } from "./ComponentView";
import { createErrorPlugin } from "./createErrorPlugin";
import { createFormatPlugins } from "./createFormatPlugins";
import { createSuggester } from "./createSuggester/createSuggester";
import { MentionView } from "./MentionView/MentionView";
import styles from "./style.module.css";
import { RenderPortal } from "./usePortals";

export type BlocksMetaMap = Record<string, BlockMeta>;

export const createEditorView = (
  renderNode: HTMLElement,
  renderPortal: RenderPortal,
  accountId: string,
  pageEntityId: string,
  blocksMeta: BlocksMetaMap,
) => {
  let manager: ProsemirrorSchemaManager;

  const [errorPlugin, onError] = createErrorPlugin(renderPortal);

  const plugins: Plugin<unknown, Schema>[] = [
    ...createFormatPlugins(renderPortal),
    createSuggester(renderPortal, () => manager, accountId),
    errorPlugin,
  ];

  const state = createProseMirrorState({ accountId, plugins });

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
        );
      },
      // Reason for adding `_decorations`:
      // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/57384#issuecomment-1018936089
      mention(currentNode, currentView, getPos, _decorations) {
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
    accountId,
    view,
    // Reason for adding `_decorations`:
    // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/57384#issuecomment-1018936089
    (meta) => (node, editorView, getPos, _decorations) => {
      if (typeof getPos === "boolean") {
        throw new Error("Invalid config for nodeview");
      }

      return new ComponentView(node, editorView, getPos, renderPortal, meta);
    },
  );

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

  view.dom.classList.add(styles.ProseMirror!);

  // prosemirror will use the first node type (per group) for auto-creation.
  // we want this to be the paragraph node type.
  const blocksMetaArray = Object.values(blocksMeta);

  const paragraphBlockMeta = blocksMetaArray.find(
    (blockMeta) =>
      blockMeta.componentMetadata.name === "@hashintel/block-paragraph",
  );

  if (!paragraphBlockMeta) {
    throw new Error("missing required block-type paragraph");
  }

  /** note that {@link ProsemirrorSchemaManager#defineNewBlock} is idempotent */
  manager.defineNewBlock(paragraphBlockMeta);
  blocksMetaArray.forEach((blockMeta) => manager.defineNewBlock(blockMeta));

  // @todo figure out how to use dev tools without it breaking fast refresh
  applyDevTools(view);

  return { view, connection, manager };
};
