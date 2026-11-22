import { Handle, Position, useNodeId, useStore } from "@xyflow/react";
import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { LinkRewiringContext } from "../link-rewiring-context";
import { receivesDrag } from "./receives-drag";

import type { CSSProperties, KeyboardEvent } from "react";

// Each handle names its colours on itself. The pane of the canvas reads them
// to draw the dot and the outline of a node outside the focused neighbourhood.
const launchHandleStyle = css({
  "--node-fill": "var(--colors-blue-s80)",
  "--node-border": "white",
  opacity: "[0]",
  ".react-flow__node:hover &, .react-flow__node:focus-within &": {
    opacity: "[1]",
  },
  "@media (hover: none)": { opacity: "[1]" },
  _before: {
    content: '""',
    position: "absolute",
    inset: "[-7.5px]",
  },
  _after: {
    content: '""',
    position: "absolute",
    inset: "[0]",
    borderRadius: "full",
    backgroundColor: "[var(--node-fill)]",
    border: "[1px solid var(--node-border)]",
    pointerEvents: "none",
  },
});

// Pseudo-elements expand hit areas without moving the anchors of component
// arcs. The handle names the colour of its outline: the pane of the canvas
// reads it to draw the outline of a node outside the focused neighbourhood.
const targetHandleStyle = css({
  "--node-outline": "var(--colors-blue-s80)",
  _after: {
    content: '""',
    position: "absolute",
    left: "[50%]",
    top: "[calc(50% - var(--arc-target-height) / 2)]",
    width: "[var(--arc-target-width)]",
    height: "[var(--arc-target-height)]",
    borderRadius: "[var(--arc-target-radius)]",
    outline: "[var(--arc-target-outline)]",
  },
  _focusVisible: { _after: { outline: "[3px solid var(--node-outline)]" } },
});

const activateHandle = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.click();
  }
};

/**
 * A place's or transition's two handles. Hovering the node reveals the
 * outgoing one; while an arc is being drawn, the whole node of a kind that
 * can receive it becomes its target.
 */
export const NodeHandles = ({
  kind,
  width,
  height,
  isConnectable,
}: {
  kind: "place" | "transition";
  width: number;
  height: number;
  isConnectable: boolean;
}) => {
  const nodeId = useNodeId();
  const sourceKind = useStore((state) =>
    state.connection.inProgress
      ? state.connection.fromNode.type
      : state.connectionClickStartHandle
        ? state.nodeLookup.get(state.connectionClickStartHandle.nodeId)?.type
        : undefined,
  );
  const isActiveTarget = useStore(
    (state) =>
      state.connection.isValid === true &&
      state.connection.toNode?.id === nodeId,
  );

  const rewiring = use(LinkRewiringContext);
  const canReceive =
    isConnectable && receivesDrag({ rewiring, sourceKind, nodeKind: kind });

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        isConnectableStart={false}
        isConnectableEnd={canReceive}
        tabIndex={canReceive ? 0 : undefined}
        role="button"
        aria-hidden={canReceive ? undefined : true}
        aria-label="Connect arc to this node"
        onKeyDown={activateHandle}
        className={targetHandleStyle}
        // Says that the outline of a target is drawn, for the pane to fade
        // it with a faded node.
        data-arc-target={isActiveTarget ? "" : undefined}
        style={
          {
            "--arc-target-width": `${width}px`,
            "--arc-target-height": `${height}px`,
            "--arc-target-radius": kind === "place" ? "999px" : "0",
            "--arc-target-outline": isActiveTarget
              ? "3px solid var(--node-outline)"
              : "none",
            width: 9,
            height: 9,
            border: "none",
            background: "transparent",
            outline: "none",
            pointerEvents: canReceive ? "all" : "none",
            zIndex: canReceive ? 10 : -1,
          } as CSSProperties
        }
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        isConnectableStart={isConnectable}
        isConnectableEnd={false}
        tabIndex={isConnectable ? 0 : undefined}
        role="button"
        aria-label="Create outgoing arc"
        onKeyDown={activateHandle}
        className={launchHandleStyle}
        style={{
          width: 9,
          height: 9,
          right: 0,
          border: "none",
          background: "transparent",
          zIndex: 11,
          visibility: isConnectable && !sourceKind ? "visible" : "hidden",
        }}
      />
    </>
  );
};
