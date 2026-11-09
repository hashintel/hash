import { useStore, type ConnectionLineComponent } from "@xyflow/react";
import { useId } from "react";

import { getOutlineArcPath, getOutlineNode } from "./shared/outline-arcs";

import type { NodeType } from "./react-flow-types";

/**
 * The arc being drawn. It leaves the source node's outline, or the port it
 * was dragged from, and meets the target's outline once the target is valid.
 */
export const OutlineConnectionLine: ConnectionLineComponent<NodeType> = ({
  fromNode,
  fromX,
  fromY,
  toNode,
  toX,
  toY,
  connectionStatus,
  connectionLineStyle,
}) => {
  const markerId = useId();
  const hasReverseArc = useStore(
    (state) =>
      toNode !== null &&
      state.edges.some(
        (edge) => edge.source === toNode.id && edge.target === fromNode.id,
      ),
  );
  const source = getOutlineNode(fromNode.data);
  const target =
    connectionStatus === "valid" && toNode ? getOutlineNode(toNode.data) : null;
  const [path] = getOutlineArcPath(
    source ?? { x: fromX, y: fromY },
    target ?? { x: toX, y: toY },
    source !== null && target !== null && hasReverseArc,
  );
  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          markerWidth="10"
          markerHeight="10"
          refX="10"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0,0 L 10,5 L 0,10 Z" fill="var(--colors-blue-s80)" />
        </marker>
      </defs>
      <path
        className="react-flow__connection-path"
        d={path}
        fill="none"
        strokeDasharray={connectionStatus === "valid" ? undefined : "5 4"}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: "var(--colors-blue-s80)",
          strokeWidth: 2,
          ...connectionLineStyle,
        }}
      />
    </>
  );
};
