import { useRef, useState } from "react";

import { linkEnd, type CanvasLinkEndName } from "../../../canvas-scene";
import { toCanvasConnection, type FlowConnection } from "./port-handles";
import {
  linkItemOf,
  type CanvasEdgeType,
  type NodeType,
} from "./react-flow-types";

import type {
  CanvasInteractions,
  CanvasLinkRewire,
} from "../../../use-canvas-interactions";
import type { IsValidConnection, ReactFlowProps } from "@xyflow/react";

type ReconnectProps = Pick<
  ReactFlowProps<NodeType, CanvasEdgeType>,
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

type MovingEnd = Pick<CanvasLinkRewire, "fusionId" | "from"> & {
  end: CanvasLinkEndName;
};

// React Flow builds the connection around the end that stays, so the end
// dropped has the name of the end picked up.
const rewireOnto = (
  { fusionId, from, end }: MovingEnd,
  connection: FlowConnection,
): CanvasLinkRewire => ({
  fusionId,
  from,
  onto: linkEnd(toCanvasConnection(connection), end),
});

/**
 * Dragging an end of a fusion link, as React Flow's edge reconnection. React
 * Flow draws the gesture as a connection from the end that stays, so the
 * check of a connection has to know that a link is being moved: the link and
 * its end are held from the start of the gesture to its end.
 *
 * `isConnecting` says whether React Flow still has the gesture in progress.
 * A gesture cancelled with Escape is reported as ended all the same, on the
 * next pointer move, and must change nothing.
 *
 * `isRewiring` is for what renders: a node's handles offer themselves to a
 * moved end by other rules than to a new connection.
 */
export const useLinkRewiring = (
  {
    readonly,
    isValidConnection: isValidNewConnection,
    canRewireLink,
    rewireLink,
  }: Pick<
    CanvasInteractions,
    "readonly" | "isValidConnection" | "canRewireLink" | "rewireLink"
  >,
  isConnecting: () => boolean,
): {
  isValidConnection: IsValidConnection;
  reconnectProps: ReconnectProps;
  isRewiring: boolean;
} => {
  // A ref: React Flow ends the gesture with the handlers it had when the
  // gesture began, which a state set since then would not have reached.
  const moving = useRef<MovingEnd | null>(null);
  const [isRewiring, setIsRewiring] = useState(false);

  return {
    isRewiring,
    isValidConnection: (connection) =>
      moving.current
        ? canRewireLink(rewireOnto(moving.current, connection))
        : isValidNewConnection(toCanvasConnection(connection)),
    // React Flow offers the ends of an edge to drag only when it is given
    // `onReconnect`.
    reconnectProps: readonly
      ? {}
      : {
          onReconnectStart: (_event, edge, keptEnd) => {
            const end = keptEnd === "source" ? "target" : "source";
            moving.current = {
              fusionId: linkItemOf(edge).id,
              from: linkEnd(toCanvasConnection(edge), end),
              end,
            };
            setIsRewiring(true);
          },
          onReconnect: (_edge, connection) => {
            if (moving.current && isConnecting()) {
              rewireLink(rewireOnto(moving.current, connection));
            }
          },
          onReconnectEnd: (event, _edge, _keptEnd, connection) => {
            if (
              moving.current &&
              isConnecting() &&
              connection.toHandle === null &&
              endedOnPane(event)
            ) {
              const { fusionId, from } = moving.current;
              rewireLink({ fusionId, from, onto: null });
            }
            moving.current = null;
            setIsRewiring(false);
          },
        },
  };
};
