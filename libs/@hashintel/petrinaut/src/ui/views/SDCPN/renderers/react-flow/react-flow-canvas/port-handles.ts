/**
 * Component instance ports are React Flow handles; these are the handle ids
 * that name them, and the translation of a React Flow connection to a canvas
 * connection.
 */

import type { CanvasConnection } from "../../../use-canvas-interactions";
import type { Edge } from "@xyflow/react";

const portInPrefix = "port-in-";
const portOutPrefix = "port-out-";

export const portInHandleId = (portId: string): string =>
  `${portInPrefix}${portId}`;

export const portOutHandleId = (portId: string): string =>
  `${portOutPrefix}${portId}`;

/** The port a handle is a pin of, whichever side of its instance the pin is on. */
const portIdOf = (handle: string | null | undefined): string | null => {
  const prefix = [portInPrefix, portOutPrefix].find((candidate) =>
    handle?.startsWith(candidate),
  );
  return handle && prefix ? handle.slice(prefix.length) : null;
};

/** The ends of a connection as React Flow names them, on a connection or on an edge. */
export type FlowConnection = Pick<
  Edge,
  "source" | "target" | "sourceHandle" | "targetHandle"
>;

export const toCanvasConnection = (
  connection: FlowConnection,
): CanvasConnection => ({
  sourceId: connection.source,
  targetId: connection.target,
  sourcePortId: portIdOf(connection.sourceHandle),
  targetPortId: portIdOf(connection.targetHandle),
});
