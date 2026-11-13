import { useRef } from "react";

import { linkEnd, type CanvasLinkEndName } from "../../../canvas-scene";
import { toCanvasConnection } from "./port-handles";

import type {
  CanvasInteractions,
  CanvasLinkRewire,
} from "../../../use-canvas-interactions";
import type { IsValidConnection, ReactFlowProps } from "@xyflow/react";

type ReconnectProps = Pick<
  ReactFlowProps,
  "onReconnect" | "onReconnectStart" | "onReconnectEnd"
>;

/**
 * Whether a drag ended over the empty canvas, not over a node or a line.
 * Read from where the pointer is: a touch reports the element it began on.
 */
const endedOnPane = (event: MouseEvent | TouchEvent): boolean => {
  const point = "changedTouches" in event ? event.changedTouches[0] : event;
  return (
    point !== undefined &&
    (document
      .elementFromPoint(point.clientX, point.clientY)
      ?.classList.contains("react-flow__pane") ??
      false)
  );
};

/**
 * Dragging an end of a fusion link, as React Flow's edge reconnection. React
 * Flow draws the gesture as a connection from the end that stays, so the
 * check of a connection has to know that a link is being moved: the link and
 * its end are held from the start of the gesture to its end.
 *
 * `isConnecting` says whether React Flow still has the gesture in progress.
 * A gesture cancelled with Escape is reported as ended all the same, on the
 * next pointer move, and must change nothing.
 */
export const useLinkRewiring = (
  interactions: CanvasInteractions,
  isConnecting: () => boolean,
): {
  isValidConnection: IsValidConnection;
  reconnectProps: ReconnectProps;
} => {
  const moving = useRef<Pick<CanvasLinkRewire, "linkId" | "end"> | null>(null);

  // React Flow builds the connection around the end that stays, so the end
  // dropped has the name of the end picked up.
  const droppedEnd = (
    connection: Parameters<typeof toCanvasConnection>[0],
    end: CanvasLinkEndName,
  ) => linkEnd(toCanvasConnection(connection), end);

  return {
    isValidConnection: (connection) =>
      moving.current
        ? interactions.canRewireLink({
            ...moving.current,
            onto: droppedEnd(connection, moving.current.end),
          })
        : interactions.isValidConnection(toCanvasConnection(connection)),
    // React Flow offers the ends of an edge to drag only when it is given
    // `onReconnect`.
    reconnectProps: interactions.readonly
      ? {}
      : {
          onReconnectStart: (_event, edge, keptEnd) => {
            moving.current = {
              linkId: edge.id,
              end: keptEnd === "source" ? "target" : "source",
            };
          },
          onReconnect: (_edge, connection) => {
            if (moving.current && isConnecting()) {
              interactions.rewireLink({
                ...moving.current,
                onto: droppedEnd(connection, moving.current.end),
              });
            }
          },
          onReconnectEnd: (event, _edge, _keptEnd, connection) => {
            if (
              moving.current &&
              isConnecting() &&
              connection.toHandle === null &&
              endedOnPane(event)
            ) {
              interactions.rewireLink({ ...moving.current, onto: null });
            }
            moving.current = null;
          },
        },
  };
};
