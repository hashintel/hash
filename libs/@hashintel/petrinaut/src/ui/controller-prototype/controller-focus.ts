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

/**
 * The canvas focus while a Rate lever is selected in the panel: its node is
 * ringed, its rivals' nodes get a faint ring, and the rest of the net fades.
 */
export const resolveLeverSelectionFocus = (
  nodeId: string,
  rivalNodeIds: ReadonlySet<string>,
): CanvasFocus => ({
  active: true,
  nodeFocus: (id) =>
    id === nodeId ? "focused" : rivalNodeIds.has(id) ? "linked" : "none",
  arcFocus: () => "none",
});
