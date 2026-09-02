/**
 * Component instance ports are React Flow handles; these are the handle ids
 * that name them, and the translation of a React Flow connection to a canvas
 * connection.
 */

import type { CanvasConnection } from "../../../use-canvas-interactions";
import type { Connection } from "@xyflow/react";

const portInPrefix = "port-in-";
const portOutPrefix = "port-out-";

export const portInHandleId = (portId: string): string =>
  `${portInPrefix}${portId}`;

export const portOutHandleId = (portId: string): string =>
  `${portOutPrefix}${portId}`;

const portIdOf = (handle: string | null | undefined, prefix: string) =>
  handle?.startsWith(prefix) ? handle.slice(prefix.length) : null;

export const toCanvasConnection = (
  connection: Connection,
): CanvasConnection => ({
  sourceId: connection.source,
  targetId: connection.target,
  sourcePortId: portIdOf(connection.sourceHandle, portOutPrefix),
  targetPortId: portIdOf(connection.targetHandle, portInPrefix),
});
