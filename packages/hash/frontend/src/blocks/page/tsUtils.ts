import { BlockMeta } from "@hashintel/hash-shared/blockMeta";
import { DefineNodeView } from "@hashintel/hash-shared/defineNodeView";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { ComponentNodeView } from "./ComponentNodeView";
import { ReplacePortal } from "./usePortals";

const createComponentNodeViewFactory = (
  replacePortal: ReplacePortal,
  meta: BlockMeta
) => {
  // Add the node view definition to the view – ensures our block code is
  // called for every instance of the block
  return (
    node: ProsemirrorNode<Schema>,
    editorView: EditorView<Schema>,
    getPos: (() => number) | boolean
  ) => {
    if (typeof getPos === "boolean") {
      throw new Error("Invalid config for nodeview");
    }

    return new ComponentNodeView(node, editorView, getPos, replacePortal, meta);
  };
};

export const defineNodeViewFactory =
  (
    // @todo type this
    view: any,
    replacePortal: ReplacePortal
  ): DefineNodeView =>
  (meta) => {
    view.setProps({
      nodeViews: {
        ...view.nodeViews,
        [meta.componentMetadata.componentId]: createComponentNodeViewFactory(
          replacePortal,
          meta
        ),
      },
    });
  };

export const collabEnabled =
  typeof window !== "undefined" && window.location.search.includes("collab");
