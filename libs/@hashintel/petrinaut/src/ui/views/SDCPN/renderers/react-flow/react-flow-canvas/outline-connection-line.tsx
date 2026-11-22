import { useId } from "react";

import { useArcLayerInput } from "./arc-layer-context";
import {
  curvePath,
  fixedEndpoint,
  getOutlineArcCurve,
  getOutlineNode,
} from "./shared/outline-arcs";

import type { NodeType } from "./react-flow-types";
import type { ConnectionLineComponent } from "@xyflow/react";

/**
 * The arc being drawn, along the path it will take once created: from the
 * source node's outline, or the port it was dragged from, to the pointer, and
 * to the target's outline or port once the target is valid.
 */
export const OutlineConnectionLine: ConnectionLineComponent<NodeType> = ({
  fromNode,
  fromX,
  fromY,
  fromPosition,
  toNode,
  toX,
  toY,
  toPosition,
  connectionStatus,
  connectionLineStyle,
}) => {
  const markerId = useId();
  // The lane of an arc that has a line running the other way: an arc or a
  // fusion link. React Flow mounts this only while a connection is drawn.
  const { scene } = useArcLayerInput();
  const hasReverseArc =
    toNode !== null &&
    [scene.arcs, scene.fusions].some((links) =>
      links.some(
        (link) => link.sourceId === toNode.id && link.targetId === fromNode.id,
      ),
    );
  const sourceOutline = getOutlineNode(fromNode.data);
  const snapped = connectionStatus === "valid" && toNode !== null;
  const targetOutline = snapped ? getOutlineNode(toNode.data) : null;
  const path = curvePath(
    getOutlineArcCurve(
      sourceOutline ?? fixedEndpoint(fromX, fromY, fromPosition),
      targetOutline ??
        fixedEndpoint(toX, toY, snapped ? toPosition : undefined),
      snapped && hasReverseArc,
    ),
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
