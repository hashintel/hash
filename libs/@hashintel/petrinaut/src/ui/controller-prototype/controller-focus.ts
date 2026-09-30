import type { CanvasFocus } from "../views/SDCPN/canvas-focus";

/**
 * The canvas focus while a controller is selected: its lever nodes are
 * ringed and the rest of the net fades. Neighbours get no role, so the rings
 * show the levers alone.
 */
export const resolveControllerFocus = (
  leverNodeIds: ReadonlySet<string>,
): CanvasFocus => ({
  active: leverNodeIds.size > 0,
  nodeFocus: (id) => (leverNodeIds.has(id) ? "focused" : "none"),
  arcFocus: () => "none",
});
