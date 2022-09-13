import { HashBlock } from "@hashintel/hash-shared/blocks";
import { createProseMirrorState } from "@hashintel/hash-shared/createProseMirrorState";
import { apiOrigin } from "@hashintel/hash-shared/environment";
import { ProsemirrorManager } from "@hashintel/hash-shared/ProsemirrorManager";
// import applyDevTools from "prosemirror-dev-tools";
import { NodeType, ProsemirrorNode, Schema, Slice } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { Decoration, EditorView } from "prosemirror-view";
import { RefObject } from "react";
import { LoadingView } from "./LoadingView";
import { BlockView } from "./BlockView";
import { EditorConnection } from "./collab/EditorConnection";
import { ComponentView } from "./ComponentView";
import { createCommentPlugin } from "./createCommentPlugin";
import { createErrorPlugin } from "./createErrorPlugin";
import { createFormatPlugins } from "./createFormatPlugins";
import { createPlaceholderPlugin } from "./createPlaceholderPlugin/createPlaceholderPlugin";
import { createSuggester } from "./createSuggester/createSuggester";
import { createFocusPageTitlePlugin } from "./focusPageTitlePlugin";
import { MentionView } from "./MentionView/MentionView";
import styles from "./style.module.css";
import { RenderPortal } from "./usePortals";

export type BlocksMap = Record<string, HashBlock>;

// /**
//  * Prosemirror doesn't know to convert hard breaks into new line characters
//  * in the plain text version of the clipboard when we copy out of the
//  * editor. In the HTML version, they get converted as their `toDOM`
//  * method instructs, but we have to use this for the plain text version.
//  *
//  * @todo find a way of not having to do this centrally
//  * @todo look into whether this is needed for mentions and for links
//  */
export const clipboardTextSerializer =
  (nodeType?: NodeType<Schema>) => (slice: Slice<Schema>) => {
    return slice.content.textBetween(
      0,
      slice.content.size,
      "\n\n",
      (node: ProsemirrorNode<Schema>) => {
        if (node.type === nodeType) {
          return "\n";
        }

        return "";
      },
    );
  };

// Reason for adding `_decorations`:
// https://github.com/DefinitelyTyped/DefinitelyTyped/pull/57384#issuecomment-1018936089
export const mentionNodeView =
  (renderPortal: RenderPortal, accountId: string) =>
  (
    currentNode: ProsemirrorNode<Schema>,
    currentView: EditorView<Schema>,
    getPos: () => number,
    _decorations: Decoration[],
  ) => {
    if (typeof getPos === "boolean") {
      throw new Error("Invalid config for nodeview");
    }

    return new MentionView(
      currentNode,
      currentView,
      getPos,
      renderPortal,
      accountId,
    );
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
) => {
  let manager: ProsemirrorManager;

  const [errorPlugin, onError] = createErrorPlugin(renderPortal);

  const plugins: Plugin<unknown, Schema>[] = [
    ...createFormatPlugins(renderPortal),
    createSuggester(renderPortal, accountId, renderNode, () => manager),
    createPlaceholderPlugin(renderPortal),
    errorPlugin,
    createFocusPageTitlePlugin(pageTitleRef),
    createCommentPlugin(renderPortal, renderNode),
  ];

  const state = createProseMirrorState({ accountId, plugins });

  let connection: EditorConnection;

  const view = new EditorView<Schema>(renderNode, {
    state,
    clipboardTextSerializer: clipboardTextSerializer(
      state.schema.nodes.hardBreak,
    ),
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
      // Reason for adding unused params e.g. `_decorations`:
      // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/57384#issuecomment-1018936089
      loading(currentNode, _currentView, _getPos, _decorations) {
        return new LoadingView(currentNode, renderPortal);
      },
      mention: mentionNodeView(renderPortal, accountId),
    },
    dispatchTransaction: (tr) => connection?.dispatchTransaction(tr),
    editable: () => !readonly,
  });

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
  blocksArray.forEach((block) => manager.defineBlock(block));

  // @todo figure out how to use dev tools without it breaking fast refresh
  // applyDevTools(view);

  return { view, connection, manager };
};
