import { Block, BlockConfig } from "./blockMeta";

// @todo simply this / move it
export type DefineNodeView = (
  componentId: string,
  componentSchema: Block["componentSchema"],
  componentMetadata: BlockConfig
) => void;
