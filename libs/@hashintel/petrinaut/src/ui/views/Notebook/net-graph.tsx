import { use, useId } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { useNetGraphTransition } from "./net-graph-animation";
import {
  edgePath,
  layoutNetGraph,
  NET_NODE_HEIGHT,
  NET_NODE_WIDTH,
} from "./net-graph-layout";

import type { PositionedNetNode } from "./net-graph-layout";
import type { NetGraph, NetGraphNode } from "./notebook-model";

/** Fills the pane it is given; the diagram scrolls inside when it overflows. */
const scrollContainerStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  minHeight: "[0]",
  overflow: "auto",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.s30",
  borderRadius: "md",
  backgroundColor: "neutral.s05",
  display: "grid",
});

/**
 * Centres the diagram when it is smaller than the pane, while still letting
 * it grow past the edges (and scroll) when the net is large.
 */
const svgWrapperStyle = css({
  margin: "auto",
  padding: "2",
});

const shapeStyle = cva({
  base: {
    strokeWidth: "[1.5]",
    transition: "[fill 100ms ease-out, stroke 100ms ease-out]",
  },
  variants: {
    role: {
      selected: { fill: "neutral.s00", stroke: "neutral.s115" },
      dependency: { fill: "blue.s20", stroke: "blue.s90" },
      dependent: { fill: "orange.s20", stroke: "orange.s90" },
      both: { fill: "purple.s20", stroke: "purple.s90" },
      plain: { fill: "neutral.s00", stroke: "neutral.s45" },
      muted: { fill: "neutral.s00", stroke: "neutral.s35" },
    },
  },
});

const nodeGroupStyle = css({
  cursor: "pointer",
  _hover: { "& [data-shape]": { filter: "[brightness(0.96)]" } },
  _focusVisible: {
    outline: "[none]",
    "& [data-shape]": { strokeWidth: "[2.5]" },
  },
});

const labelStyle = cva({
  base: {
    fontSize: "[9px]",
    textAnchor: "middle",
    dominantBaseline: "central",
    pointerEvents: "none",
  },
  variants: {
    role: {
      selected: { fill: "neutral.s115", fontWeight: "semibold" },
      dependency: { fill: "blue.s110" },
      dependent: { fill: "orange.s115" },
      both: { fill: "purple.s115" },
      plain: { fill: "neutral.s110" },
      muted: { fill: "neutral.s90" },
    },
  },
});

const edgeStyle = cva({
  base: { fill: "[none]" },
  variants: {
    role: {
      incoming: { stroke: "blue.s90", strokeWidth: "[1.5]" },
      outgoing: { stroke: "orange.s90", strokeWidth: "[1.5]" },
      plain: { stroke: "neutral.s45", strokeWidth: "[1]" },
      muted: { stroke: "neutral.s35", strokeWidth: "[1]" },
    },
    isBackEdge: {
      true: { strokeDasharray: "[3 3]" },
      false: {},
    },
  },
});

const arrowFillStyle = cva({
  base: {},
  variants: {
    role: {
      incoming: { fill: "blue.s90" },
      outgoing: { fill: "orange.s90" },
      plain: { fill: "neutral.s45" },
      muted: { fill: "neutral.s35" },
    },
  },
});

const emptyHintStyle = css({
  fontSize: "xs",
  color: "neutral.fg.subtle",
  padding: "3",
});

type NodeRole =
  | "selected"
  | "dependency"
  | "dependent"
  /** Both a dependency and a dependent — a cycle through the selected node. */
  | "both"
  | "plain"
  | "muted";
type EdgeRole = "incoming" | "outgoing" | "plain" | "muted";

const EDGE_ROLES = ["incoming", "outgoing", "plain", "muted"] as const;

// Marker ids are document-global, so they carry a per-instance prefix to keep
// two mounted graphs from resolving to each other's arrowheads.
const markerId = (instanceId: string, role: EdgeRole) =>
  `${instanceId}-net-graph-arrow-${role}`;

const MAX_LABEL_CHARS = 13;

const truncate = (name: string, maxChars: number): string =>
  name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;

/** Places read as pills, transitions as squared boxes, as on the canvas. */
const cornerRadius = (node: NetGraphNode): number =>
  node.kind === "place" ? NET_NODE_HEIGHT / 2 : 3;

export interface NetGraphViewProps {
  graph: NetGraph;
  /** The selected place or transition, or null when nothing relevant is selected. */
  selectedId: string | null;
  /** Direct dependencies of the selection, highlighted upstream. */
  dependencyIds: ReadonlySet<string>;
  /** Direct dependents of the selection, highlighted downstream. */
  dependentIds: ReadonlySet<string>;
  /** Token-type display colour per place id, shown as a dot on the node. */
  placeColors: ReadonlyMap<string, string>;
  /** Re-layer the diagram around this node instead of by longest path. */
  focusId: string | null;
  onNavigate: (node: NetGraphNode) => void;
}

/**
 * The whole net drawn as a layered flow graph of places and transitions, laid
 * out from the arc structure rather than the stored x/y positions. With a
 * place or transition selected, that node and its direct dependencies and
 * dependents are highlighted and the rest of the net recedes — a neighbour
 * that is both, forming a cycle through the selection, gets its own colour.
 * With nothing selected the graph is drawn plainly, rooted at the nodes that
 * have no incoming arcs.
 */
export const NetGraphView: React.FC<NetGraphViewProps> = ({
  graph,
  selectedId,
  dependencyIds,
  dependentIds,
  placeColors,
  focusId,
  onNavigate,
}) => {
  const instanceId = useId();
  const layout = layoutNetGraph(graph, { focusId });
  const { showAnimations } = use(UserSettingsContext);
  const { nodeRef, edgeRef } = useNetGraphTransition(layout, {
    enabled: showAnimations,
  });

  if (layout.nodes.length === 0) {
    return (
      <p className={emptyHintStyle}>
        This net has no places or transitions yet.
      </p>
    );
  }

  const hasSelection = selectedId !== null;

  const nodeRole = (node: PositionedNetNode): NodeRole => {
    if (node.id === selectedId) {
      return "selected";
    }
    const isDependency = dependencyIds.has(node.id);
    const isDependent = dependentIds.has(node.id);
    if (isDependency && isDependent) {
      return "both";
    }
    if (isDependency) {
      return "dependency";
    }
    if (isDependent) {
      return "dependent";
    }
    return hasSelection ? "muted" : "plain";
  };

  const edgeRole = (from: string, to: string): EdgeRole => {
    if (!hasSelection) {
      return "plain";
    }
    if (to === selectedId && dependencyIds.has(from)) {
      return "incoming";
    }
    if (from === selectedId && dependentIds.has(to)) {
      return "outgoing";
    }
    return "muted";
  };

  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));

  return (
    <div className={scrollContainerStyle}>
      <div className={svgWrapperStyle}>
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          // Not role="img": that would hide the clickable node groups from
          // the accessibility tree.
          role="group"
          aria-label="Net structure graph"
        >
          <defs>
            {EDGE_ROLES.map((role) => (
              <marker
                key={role}
                id={markerId(instanceId, role)}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="4.5"
                markerHeight="4.5"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 1 L 7 4 L 0 7 z"
                  className={arrowFillStyle({ role })}
                />
              </marker>
            ))}
          </defs>

          {layout.edges.map((edge) => {
            const from = nodesById.get(edge.from);
            const to = nodesById.get(edge.to);
            if (from === undefined || to === undefined) {
              return null;
            }
            const role = edgeRole(edge.from, edge.to);
            const path = edgePath(from, to, edge.isBackEdge);

            return (
              <path
                key={edge.key}
                ref={edgeRef(edge.key)}
                d={path}
                className={edgeStyle({ role, isBackEdge: edge.isBackEdge })}
                markerEnd={`url(#${markerId(instanceId, role)})`}
              />
            );
          })}

          {layout.nodes.map((node) => {
            const role = nodeRole(node);
            const placeColor = placeColors.get(node.id);

            return (
              // Outer group: animation offset only, written straight to the
              // DOM while a re-layout plays. Inner group: everything React owns.
              <g key={node.id} ref={nodeRef(node.id)}>
                <g
                  className={nodeGroupStyle}
                  role="button"
                  // Out of the tab order: the explorer's list rows are the
                  // keyboard path to these nodes, matching the worksheet's
                  // one-tab-stop model.
                  tabIndex={-1}
                  aria-label={`${node.kind} ${node.name}`}
                  aria-current={role === "selected" ? "true" : undefined}
                  onClick={() => onNavigate(node)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onNavigate(node);
                    }
                  }}
                >
                  <title>{node.name}</title>
                  <rect
                    data-shape
                    x={node.x}
                    y={node.y}
                    width={NET_NODE_WIDTH}
                    height={NET_NODE_HEIGHT}
                    rx={cornerRadius(node)}
                    className={shapeStyle({ role })}
                  />
                  {placeColor !== undefined && (
                    <circle
                      cx={node.x + 9}
                      cy={node.y + NET_NODE_HEIGHT / 2}
                      r={3}
                      style={{ fill: placeColor }}
                    />
                  )}
                  <text
                    x={
                      node.x +
                      NET_NODE_WIDTH / 2 +
                      (placeColor === undefined ? 0 : 4)
                    }
                    y={node.y + NET_NODE_HEIGHT / 2}
                    className={labelStyle({ role })}
                  >
                    {truncate(node.name, MAX_LABEL_CHARS)}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
