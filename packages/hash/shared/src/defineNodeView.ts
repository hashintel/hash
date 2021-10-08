import { NodeView } from "prosemirror-view";
import { Block, BlockConfig } from "./blockMeta";

// @todo simply this / move it
export type DefineNodeView = (
  componentId: string,
  componentSchema: Block["componentSchema"],
  componentMetadata: BlockConfig
) => void;

// @todo type the constructor here
export type CreateNodeView = (
  componentId: string,
  componentSchema: Block["componentSchema"],
  sourceName: string
) => new (...args: any[]) => NodeView;
