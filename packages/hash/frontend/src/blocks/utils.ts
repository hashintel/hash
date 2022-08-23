import { paragraphBlockComponentId } from "@hashintel/hash-shared/blocks";
import { componentNodeToId } from "@hashintel/hash-shared/prosemirror";
import { ProsemirrorNode, Schema } from "prosemirror-model";

export const isParagraphNode = (node: ProsemirrorNode<Schema>) => {
  return componentNodeToId(node) === paragraphBlockComponentId;
};
