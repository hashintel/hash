import { Handle, Position, useNodeId, useStore } from "@xyflow/react";
import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../../../react/state/user-settings-context";
import { handleStyling } from "../../../../styles/styling";

import type { KeyboardEvent } from "react";

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

export const NodeHandles = ({ isConnectable }: { isConnectable: boolean }) => {
  const { enableAutomaticArcConnections, compactNodes } =
    use(UserSettingsContext);
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

  const canReceive =
    isConnectable &&
    ((sourceKind === "place" && nodeKind === "transition") ||
      (sourceKind === "transition" && nodeKind === "place"));
  const borderRadius =
    nodeKind === "place" ? "999px" : compactNodes ? "0" : "12px";

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        isConnectableStart={!enableAutomaticArcConnections}
        isConnectableEnd={!enableAutomaticArcConnections || canReceive}
        tabIndex={enableAutomaticArcConnections && canReceive ? 0 : undefined}
        role={enableAutomaticArcConnections ? "button" : undefined}
        aria-hidden={
          enableAutomaticArcConnections && !canReceive ? true : undefined
        }
        aria-label={
          enableAutomaticArcConnections ? "Connect arc to this node" : undefined
        }
        onKeyDown={enableAutomaticArcConnections ? activateHandle : undefined}
        className={
          enableAutomaticArcConnections ? targetHandleStyle : undefined
        }
        style={{
          ...handleStyling,
          ...(enableAutomaticArcConnections
            ? {
                "--arc-target-width": `${node?.measured.width ?? 0}px`,
                "--arc-target-height": `${node?.measured.height ?? 0}px`,
                "--arc-target-radius": borderRadius,
                "--arc-target-outline": isActiveTarget
                  ? "3px solid var(--colors-blue-s80)"
                  : "none",
                border: "none",
                background: "transparent",
                outline: "none",
                pointerEvents: canReceive ? "all" : "none",
                zIndex: canReceive ? 10 : -1,
              }
            : {}),
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        isConnectableStart={isConnectable}
        isConnectableEnd={!enableAutomaticArcConnections}
        tabIndex={
          enableAutomaticArcConnections && isConnectable ? 0 : undefined
        }
        role={enableAutomaticArcConnections ? "button" : undefined}
        aria-label={
          enableAutomaticArcConnections ? "Create outgoing arc" : undefined
        }
        onKeyDown={enableAutomaticArcConnections ? activateHandle : undefined}
        className={
          enableAutomaticArcConnections ? launchHandleStyle : undefined
        }
        style={
          enableAutomaticArcConnections
            ? {
                width: 9,
                height: 9,
                right: 0,
                border: "none",
                background: "transparent",
                zIndex: 11,
                visibility: isConnectable && !sourceKind ? "visible" : "hidden",
              }
            : handleStyling
        }
      />
    </>
  );
};
