import { useStore, type ConnectionLineComponent } from "@xyflow/react";
import { use, useId } from "react";

import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { getOutlineArcPath, getOutlineNode } from "./shared/outline-arcs";

import type { NodeType } from "./react-flow-types";

export const OutlineConnectionLine: ConnectionLineComponent<NodeType> = ({
  fromNode,
  toNode,
  toX,
  toY,
  connectionStatus,
  connectionLineStyle,
}) => {
  const { compactNodes } = use(UserSettingsContext);
  const markerId = useId();
  const hasReverseArc = useStore(
    (state) =>
      toNode !== null &&
      state.edges.some(
        (edge) => edge.source === toNode.id && edge.target === fromNode.id,
      ),
  );
  const source = getOutlineNode(fromNode.data, compactNodes);
  const target =
    connectionStatus === "valid" && toNode
      ? getOutlineNode(toNode.data, compactNodes)
      : null;
  if (!source) {
    return null;
  }
  const [path] = getOutlineArcPath(
    source,
    target ?? { x: toX, y: toY },
    target !== null && hasReverseArc,
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
