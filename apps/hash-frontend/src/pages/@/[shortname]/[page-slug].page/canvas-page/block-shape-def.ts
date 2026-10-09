import { defineShape } from "@tldraw/tldraw";

import { BlockUtil } from "./block-shape";

import type { BlockShape } from "./block-shape";

// Defines our custom shape, using its type definition and class
export const BlockShapeDef = defineShape<BlockShape, BlockUtil>({
  type: "bpBlock",
  getShapeUtil: () => BlockUtil,
});
