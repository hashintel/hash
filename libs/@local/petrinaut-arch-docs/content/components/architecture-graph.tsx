/**
 * The interactive layer map: fold a layer's children away, or open them up.
 *
 * Every reachable fold state was laid out by ELK during the build and ships in
 * `./architecture-layouts`, so this component never computes a layout — it looks
 * one up. That is what lets it render a real diagram on the server, before any
 * JavaScript has run, and what keeps ELK out of the client bundle entirely.
 *
 * Two renderers, one data source:
 *
 * - Server, and the first client render: a plain inline `<svg>` built from the
 *   shipped coordinates. No dependencies beyond React, every layer is a real
 *   `<a href>`, and a host that never hydrates the island still gets a correct,
 *   navigable diagram rather than an empty box.
 * - After mount: the same graph in React Flow, which adds pan, zoom, a minimap
 *   and the fold controls.
 *
 * Props are strings for the reason given in `./inline`.
 */

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useState, type ReactElement } from "react";

import { layouts } from "./architecture-layouts";

import "@xyflow/react/dist/style.css";

// The `--pnd-*` custom properties every diagram component styles against live
// here. Without it the graph renders with `stroke: none` and no visible edges.
import "./diagram.css";
import "./architecture-graph.css";

import type {
  LayoutEdge,
  LayoutNode,
  LayoutState,
} from "./architecture-layouts";

export interface ArchitectureGraphProps {
  /**
   * Wrapped around a layer's bundle-relative slug to make a link.
   *
   * The bundle knows its own slugs but not how a host addresses them: this site
   * builds `core.html`, another may serve `core` or `core/`. Markdown links in
   * the pages are rewritten by the host's own pipeline; these are built in JSX
   * and are not, so the host has to say. Prefix `/` and no suffix suits a site
   * serving the bundle at its root with extensionless URLs.
   */
  hrefPrefix?: string;
  hrefSuffix?: string;
  /** Height of the interactive canvas. Any CSS length. */
  height?: string;
}

const layerById = new Map(layouts.layers.map((layer) => [layer.id, layer]));

const stateByKey = new Map(layouts.states.map((state) => [state.key, state]));

const keyFor = (collapsed: Iterable<string>): string => {
  const sorted = [...collapsed].sort((left, right) =>
    left.localeCompare(right),
  );
  return sorted.length === 0 ? "_" : sorted.join("+");
};

/** Colour class from the top-level ancestor, matching the static diagrams. */
const familyOf = (id: string): string => id.split(".")[0] ?? id;

const describe = (
  node: LayoutNode,
  state: LayoutState,
): { name: string; badge: string; role: string; internal: number } => {
  const layer = layerById.get(node.id);
  const facts = state.facts[node.id];
  const files = facts?.fileCount ?? 0;
  const folded = facts?.foldedLayers ?? 0;

  return {
    name: layer?.name ?? node.id,
    role: layer?.role ?? "",
    badge:
      folded > 0
        ? `${files} files · ${folded} layers`
        : `${files} ${files === 1 ? "file" : "files"}`,
    internal: facts?.internal ?? 0,
  };
};

/** Thicker line for a heavier dependency, flattened so 235 does not dwarf 1. */
const strokeWidth = (edge: LayoutEdge): number => {
  const total = edge.forward + edge.reverse;
  return Math.min(4, 1 + Math.log10(Math.max(1, total)));
};

const edgeTitle = (edge: LayoutEdge): string => {
  const from = layerById.get(edge.from)?.name ?? edge.from;
  const to = layerById.get(edge.to)?.name ?? edge.to;
  const forward = `${from} → ${to}: ${edge.forward} file-level ${
    edge.forward === 1 ? "dependency" : "dependencies"
  }`;
  return edge.reverse > 0
    ? `${forward}\n${to} → ${from}: ${edge.reverse}`
    : forward;
};

/* -------------------------------------------------------------------------- */
/*  Static renderer — server, and the first client render                      */
/* -------------------------------------------------------------------------- */

/** Absolute position of each node, accumulated down the parent chain. */
const absolutePositions = (state: LayoutState): Map<string, LayoutNode> => {
  const absolute = new Map<string, LayoutNode>();

  for (const node of state.nodes) {
    const parentId = node.id.includes(".")
      ? node.id.slice(0, node.id.lastIndexOf("."))
      : null;
    const parent = parentId === null ? undefined : absolute.get(parentId);

    absolute.set(node.id, {
      ...node,
      x: node.x + (parent?.x ?? 0),
      y: node.y + (parent?.y ?? 0),
    });
  }

  return absolute;
};

const StaticGraph = ({
  state,
  href,
}: {
  state: LayoutState;
  href: (id: string) => string;
}): ReactElement => {
  const absolute = absolutePositions(state);
  const isContainer = (id: string): boolean =>
    state.nodes.some((other) => other.id.startsWith(`${id}.`));

  return (
    <svg
      className="pnd-graph-svg"
      role="img"
      aria-label="Architecture layers and their dependencies"
      viewBox={`-8 -8 ${state.width + 16} ${state.height + 16}`}
    >
      <defs>
        <marker
          id="pnd-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
        >
          <path d="M0,0 L7,3.5 L0,7 z" fill="context-stroke" />
        </marker>
      </defs>

      {state.edges.map((edge) => (
        <polyline
          className="pnd-graph-edge"
          key={`${edge.from} ${edge.to}`}
          points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
          strokeWidth={strokeWidth(edge)}
          markerEnd="url(#pnd-arrow)"
          markerStart={edge.reverse > 0 ? "url(#pnd-arrow)" : undefined}
        >
          <title>{edgeTitle(edge)}</title>
        </polyline>
      ))}

      {state.nodes.map((node) => {
        const position = absolute.get(node.id);
        const { name, badge, role } = describe(node, state);
        const container = isContainer(node.id);

        return (
          <a
            key={node.id}
            href={href(node.id)}
            className={`pnd-graph-node pnd-family-${familyOf(node.id)}${
              container ? " pnd-graph-node-container" : ""
            }`}
          >
            <title>{role}</title>
            <rect
              x={position?.x ?? 0}
              y={position?.y ?? 0}
              width={node.width}
              height={node.height}
              rx="6"
            />
            <text x={(position?.x ?? 0) + 12} y={(position?.y ?? 0) + 24}>
              {name}
            </text>
            {container ? null : (
              <text
                className="pnd-graph-badge"
                x={(position?.x ?? 0) + 12}
                y={(position?.y ?? 0) + 42}
              >
                {badge}
              </text>
            )}
          </a>
        );
      })}
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/*  Interactive renderer — after mount                                         */
/* -------------------------------------------------------------------------- */

interface LayerNodeData extends Record<string, unknown> {
  name: string;
  badge: string;
  role: string;
  internal: number;
  href: string;
  family: string;
  container: boolean;
  expandable: boolean;
  collapsed: boolean;
  onToggle: (() => void) | null;
}

const LayerNode = ({ data }: NodeProps): ReactElement => {
  const {
    name,
    badge,
    role,
    internal,
    href,
    family,
    container,
    expandable,
    collapsed,
    onToggle,
  } = data as LayerNodeData;

  return (
    <div
      className={`pnd-flow-node pnd-family-${family}${
        container ? " pnd-flow-node-container" : ""
      }`}
      title={role}
    >
      <Handle type="target" position={Position.Left} />
      <div className="pnd-flow-head">
        <a className="pnd-flow-name" href={href}>
          {name}
        </a>
        {expandable && onToggle ? (
          <button
            type="button"
            className="pnd-flow-toggle"
            onClick={onToggle}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
            aria-expanded={!collapsed}
          >
            {collapsed ? "+" : "−"}
          </button>
        ) : null}
      </div>
      {container ? null : (
        <div className="pnd-flow-badge">
          {badge}
          {internal > 0 ? (
            <span
              className="pnd-flow-internal"
              title={`${internal} file-level dependencies between things inside this layer, not drawn`}
            >
              {` · ${internal} internal`}
            </span>
          ) : null}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

const nodeTypes = { layer: LayerNode };

const toFlowNodes = (
  state: LayoutState,
  href: (id: string) => string,
  toggle: (id: string) => void,
): FlowNode[] =>
  state.nodes.map((node) => {
    const parentId = node.id.includes(".")
      ? node.id.slice(0, node.id.lastIndexOf("."))
      : null;
    const hasParent =
      parentId !== null && state.nodes.some((other) => other.id === parentId);
    const container = state.nodes.some((other) =>
      other.id.startsWith(`${node.id}.`),
    );
    const layer = layerById.get(node.id);
    const { name, badge, role, internal } = describe(node, state);

    return {
      id: node.id,
      type: "layer",
      position: { x: node.x, y: node.y },
      ...(hasParent ? { parentId, extent: "parent" as const } : {}),
      draggable: false,
      connectable: false,
      style: { width: node.width, height: node.height },
      data: {
        name,
        badge,
        role,
        internal,
        href: href(node.id),
        family: familyOf(node.id),
        container,
        expandable: layer?.expandable ?? false,
        collapsed: state.facts[node.id]?.collapsed ?? false,
        onToggle: layer?.expandable ? () => toggle(node.id) : null,
      } satisfies LayerNodeData,
    };
  });

const toFlowEdges = (state: LayoutState): FlowEdge[] =>
  state.edges.map((edge) => ({
    id: `${edge.from}--${edge.to}`,
    source: edge.from,
    target: edge.to,
    type: "smoothstep",
    label: String(edge.forward + edge.reverse),
    className: edge.crossesPackage ? "pnd-flow-edge-cross" : "pnd-flow-edge",
    style: { strokeWidth: strokeWidth(edge) },
    markerEnd: { type: MarkerType.ArrowClosed },
    ...(edge.reverse > 0
      ? { markerStart: { type: MarkerType.ArrowClosed } }
      : {}),
  }));

/* -------------------------------------------------------------------------- */

export const ArchitectureGraph = ({
  hrefPrefix = "/",
  hrefSuffix = "",
  height = "600px",
}: ArchitectureGraphProps): ReactElement => {
  const href = (id: string): string =>
    `${hrefPrefix}${layerById.get(id)?.slug ?? ""}${hrefSuffix}`;

  const [collapsed, setCollapsed] = useState<string[]>(
    () => stateByKey.get(layouts.initialState)?.collapsed ?? [],
  );
  // Hydration-safe: the server and the first client render both produce the
  // static SVG, and the swap to React Flow happens in an effect afterwards.
  const [interactive, setInteractive] = useState(false);

  useEffect(() => setInteractive(true), []);

  const state = stateByKey.get(keyFor(collapsed));

  const toggle = (id: string): void =>
    setCollapsed((current) =>
      current.includes(id)
        ? // Opening a layer folds its own sub-layers, which is what the
          // enumerated states assume and what keeps the next view readable.
          [
            ...current.filter((candidate) => candidate !== id),
            ...layouts.layers
              .filter(
                (layer) =>
                  layer.expandable &&
                  layer.id.startsWith(`${id}.`) &&
                  !layer.id.slice(id.length + 1).includes("."),
              )
              .map((layer) => layer.id),
          ]
        : // Folding a layer makes any state recorded for a descendant
          // unobservable, so those entries are dropped rather than kept.
          [
            ...current.filter((candidate) => !candidate.startsWith(`${id}.`)),
            id,
          ],
    );

  if (state === undefined) {
    return (
      <p className="pnd-graph-error">
        No layout for fold state <code>{keyFor(collapsed)}</code>.
      </p>
    );
  }

  const flowNodes = interactive ? toFlowNodes(state, href, toggle) : [];

  return (
    <figure className="pnd pnd-graph">
      {interactive ? (
        <div className="pnd-graph-canvas" style={{ height }}>
          <ReactFlow
            // Each fold state is an independent ELK layout, so positions jump
            // rather than animate. Remounting re-runs `fitView`, which at least
            // means the new arrangement is always framed rather than leaving the
            // reader zoomed into wherever the old one happened to put things.
            key={state.key}
            nodes={flowNodes}
            edges={toFlowEdges(state)}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: false }}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.15}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      ) : (
        <StaticGraph state={state} href={href} />
      )}
      <figcaption className="pnd-box-note">
        {interactive
          ? "Click + or − to fold a layer. Node names link to their page."
          : "Layer map. Names link to each layer's page."}
      </figcaption>
    </figure>
  );
};
