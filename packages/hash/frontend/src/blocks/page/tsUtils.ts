import { DefineNodeView } from "@hashintel/hash-shared/defineNodeView";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { ComponentNodeView } from "./ComponentNodeView";
import { ReplacePortal } from "./usePortals";

export const defineNodeViewFactory =
  (
    // @todo type this
    view: any,
    replacePortal: ReplacePortal
  ): DefineNodeView =>
  // @todo perhaps arguments to this could be simpler
  (componentId, componentSchema, componentMetadata) => {
    const { source } = componentMetadata;

    if (!source) {
      throw new Error("Cannot create new block for component missing a source");
    }

    // Add the node view definition to the view – ensures our block code is
    // called for every instance of the block
    view.setProps({
      nodeViews: {
        ...view.nodeViews,
        [componentId]: (
          node: ProsemirrorNode<Schema>,
          editorView: EditorView<Schema>,
          getPos: (() => number) | boolean
        ) => {
          if (typeof getPos === "boolean") {
            throw new Error("Invalid config for nodeview");
          }

          return new ComponentNodeView(
            node,
            editorView,
            getPos,
            componentId,
            componentSchema,
            source,
            replacePortal
          );
        },
      },
    });
  };

export const collabEnabled =
  typeof window !== "undefined" && window.location.search.includes("collab");
