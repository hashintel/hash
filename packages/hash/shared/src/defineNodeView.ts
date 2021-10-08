import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { Decoration, EditorView } from "prosemirror-view";
import { Block, BlockConfig } from "./blockMeta";
import { ViewConfig } from "./prosemirror";

// @todo simply this
export type DefineNodeView = (
  componentId: string,
  componentSchema: Block["componentSchema"],
  componentMetadata: BlockConfig
) => void;

// @todo this should be in the frontend
export const defineNodeView =
  (
    createNodeView: NonNullable<ViewConfig>["createNodeView"],
    // @todo type this
    view: any
  ): DefineNodeView =>
  // @todo perhaps arguments to this could be simpler
  (
    componentId: string,
    componentSchema: Block["componentSchema"],
    componentMetadata: BlockConfig
  ) => {
    if (!componentMetadata.source) {
      throw new Error("Cannot create new block for component missing a source");
    }

    // @todo type this
    const NodeViewClass = createNodeView(
      componentId,
      componentSchema,
      componentMetadata.source
    );

    // Add the node view definition to the view – ensures our block code is
    // called for every instance of the block
    view.setProps({
      nodeViews: {
        ...view.nodeViews,
        [componentId]: (
          node: ProsemirrorNode<Schema>,
          editorView: EditorView<Schema>,
          getPos: (() => number) | boolean,
          decorations: Decoration[]
        ) => {
          return new NodeViewClass(node, editorView, getPos, decorations);
        },
      },
    });
  };
