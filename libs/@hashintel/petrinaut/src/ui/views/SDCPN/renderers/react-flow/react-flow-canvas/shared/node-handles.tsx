import { Handle, Position, useNodeId, useStore } from "@xyflow/react";

import { css } from "@hashintel/ds-helpers/css";

import type { CSSProperties, KeyboardEvent } from "react";

const launchHandleStyle = css({
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
    background: "blue.s80",
    border: "[1px solid white]",
    pointerEvents: "none",
  },
});

// Pseudo-elements expand hit areas without moving the anchors of subnet arcs.
const targetHandleStyle = css({
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
  _focusVisible: { _after: { outline: "[3px solid var(--colors-blue-s80)]" } },
});

const activateHandle = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.click();
  }
};

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
 * A place's or transition's two handles. Hovering the node reveals the
 * outgoing one; while an arc is being drawn, the whole node of a kind that
 * can receive it becomes its target.
 */
export const NodeHandles = ({ isConnectable }: { isConnectable: boolean }) => {
  const nodeId = useNodeId();
  const node = useStore((state) =>
    nodeId ? state.nodeLookup.get(nodeId) : undefined,
  );
  const nodeKind = node?.type;
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

  const canReceive = isConnectable && acceptsConnection(sourceKind, nodeKind);

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
        style={
          {
            "--arc-target-width": `${node?.measured.width ?? 0}px`,
            "--arc-target-height": `${node?.measured.height ?? 0}px`,
            "--arc-target-radius": nodeKind === "place" ? "999px" : "0",
            "--arc-target-outline": isActiveTarget
              ? "3px solid var(--colors-blue-s80)"
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
