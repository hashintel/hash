import { type InternalNode, Position, useStore } from "@xyflow/react";

import { portInHandleId, portOutHandleId } from "../port-handles";
import { type FixedEndpoint, fixedEndpoint } from "../shared/outline-arcs";

import type { CanvasArc } from "../../../../canvas-scene";
import type { PortEnd, PortEnds } from "./arc-shapes";

const noPortEnds: PortEnds = new Map();

/**
 * Where a pin of a component instance is, as React Flow measured it: the
 * middle of the side of the handle that faces away from the card. `null`
 * until the handle is measured.
 */
const pinOf = (
  node: InternalNode | undefined,
  handleId: string,
): FixedEndpoint | null => {
  const bounds = node?.internals.handleBounds;
  const handle = [...(bounds?.source ?? []), ...(bounds?.target ?? [])].find(
    (candidate) => candidate.id === handleId,
  );
  if (!node || !handle) {
    return null;
  }
  const left = node.internals.positionAbsolute.x + handle.x;
  const top = node.internals.positionAbsolute.y + handle.y;
  switch (handle.position) {
    case Position.Left:
      return fixedEndpoint(left, top + handle.height / 2, handle.position);
    case Position.Right:
      return fixedEndpoint(
        left + handle.width,
        top + handle.height / 2,
        handle.position,
      );
    case Position.Top:
      return fixedEndpoint(left + handle.width / 2, top, handle.position);
    case Position.Bottom:
      return fixedEndpoint(
        left + handle.width / 2,
        top + handle.height,
        handle.position,
      );
  }
};

const sameEnd = (
  left: FixedEndpoint | null,
  right: FixedEndpoint | null,
): boolean =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.point.x === right.point.x &&
    left.point.y === right.point.y &&
    left.normal.x === right.normal.x &&
    left.normal.y === right.normal.y);

const samePortEnds = (left: PortEnds, right: PortEnds): boolean => {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const [arcId, ends] of left) {
    const other = right.get(arcId);
    if (
      !other ||
      !sameEnd(ends.source, other.source) ||
      !sameEnd(ends.target, other.target)
    ) {
      return false;
    }
  }
  return true;
};

/** The pins of the arcs that end at a component port, among `arcs`. */
const portEndsOf = (
  arcs: readonly CanvasArc[],
  nodeOf: (nodeId: string) => InternalNode | undefined,
): PortEnds => {
  const ends = new Map<string, PortEnd>();
  for (const arc of arcs) {
    if (arc.sourcePortId !== null || arc.targetPortId !== null) {
      ends.set(arc.id, {
        source:
          arc.sourcePortId === null
            ? null
            : pinOf(nodeOf(arc.sourceId), portOutHandleId(arc.sourcePortId)),
        target:
          arc.targetPortId === null
            ? null
            : pinOf(nodeOf(arc.targetId), portInHandleId(arc.targetPortId)),
      });
    }
  }
  return ends.size === 0 ? noPortEnds : ends;
};

/**
 * Where the arcs that end at a component port meet its pins. React Flow
 * measures the pins, and measures them again on every frame a card folds,
 * so this reads its store.
 *
 * The store changes on every frame of a pan or a zoom. The value returned is
 * the same object for as long as no pin moved, and one constant for a net
 * without such arcs, so those frames render nothing here.
 */
export const usePortEnds = (arcs: readonly CanvasArc[]): PortEnds =>
  useStore(
    (state) => portEndsOf(arcs, (nodeId) => state.nodeLookup.get(nodeId)),
    samePortEnds,
  );
