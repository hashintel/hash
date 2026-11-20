/**
 * Whether a connection drawn from a node of one kind may end on a place or a
 * transition: an arc between a place and a transition, or from an instance's
 * port to a transition, and a fusion of an instance's port with a place.
 */
const acceptsConnection = (
  sourceKind: string | undefined,
  targetKind: string | undefined,
): boolean =>
  (sourceKind === "place" && targetKind === "transition") ||
  (sourceKind === "transition" && targetKind === "place") ||
  // A component instance only starts a connection from one of its ports.
  sourceKind === "componentInstance";

/**
 * Whether a place or a transition offers itself to what is being dragged. The
 * moved end of a fusion link lands on places, whatever its other end is:
 * what the drop does, or why it is refused, is for the rewiring to say.
 */
export const receivesDrag = ({
  rewiring,
  sourceKind,
  nodeKind,
}: {
  rewiring: boolean;
  sourceKind: string | undefined;
  nodeKind: string | undefined;
}): boolean =>
  rewiring ? nodeKind === "place" : acceptsConnection(sourceKind, nodeKind);
