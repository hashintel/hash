import { TLBoxTool } from "@tldraw/tldraw";

// Defines a custom tool used to draw our shape
export class BlockTool extends TLBoxTool {
  static id = "bpBlock";
  static initial = "idle";

  shapeType = "bpBlock";
}
