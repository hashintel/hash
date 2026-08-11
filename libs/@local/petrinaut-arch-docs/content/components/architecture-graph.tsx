/**
 * The interactive layer map: fold a layer's children away, or open them up.
 *
 * Every reachable fold state was laid out by ELK during the build and ships in
 * `./architecture-layouts`, so this component never computes a layout — it looks
 * one up and draws it. One renderer, used by the server and the browser alike:
 * the markup you get without JavaScript is the markup you get with it, plus a
 * zoom transform and working fold controls.
 *
 * That single-renderer property is the point. An earlier version drew the static
 * view itself and handed the interactive view to a node-editor library, which
 * meant two code paths that had to agree about the same picture — and they
 * quietly stopped agreeing. A read-only diagram wants a viewer, not an editor:
 * there is nothing here to select, drag or connect, only things to read and
 * click through to.
 *
 * `d3-zoom` supplies pan and zoom, which is the same engine the editor library
 * used internally, without the rest of it.
 *
 * Props are strings for the reason given in `./inline`.
 */

import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { layouts } from "./architecture-layouts";
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
   * and are not, so the host has to say.
   */
  hrefPrefix?: string;
  hrefSuffix?: string;
  /** Height of the canvas. Any CSS length. */
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

const parentIdOf = (id: string): string | null =>
  id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null;

/** Absolute position of each node, accumulated down the parent chain. */
const absolutePositions = (state: LayoutState): Map<string, LayoutNode> => {
  const absolute = new Map<string, LayoutNode>();

  // `state.nodes` is ordered parents-before-children, so a parent's absolute
  // position is always already known.
  for (const node of state.nodes) {
    const parentId = parentIdOf(node.id);
    const parent = parentId === null ? undefined : absolute.get(parentId);

    absolute.set(node.id, {
      ...node,
      x: node.x + (parent?.x ?? 0),
      y: node.y + (parent?.y ?? 0),
    });
  }

  return absolute;
};

/** Thicker line for a heavier dependency, flattened so 235 does not dwarf 1. */
const strokeWidth = (edge: LayoutEdge): number =>
  Math.min(4, 1 + Math.log10(Math.max(1, edge.forward + edge.reverse)));

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

const describe = (
  id: string,
  state: LayoutState,
): { name: string; badge: string; role: string; internal: number } => {
  const layer = layerById.get(id);
  const facts = state.facts[id];
  const files = facts?.fileCount ?? 0;
  const folded = facts?.foldedLayers ?? 0;

  return {
    name: layer?.name ?? id,
    role: layer?.role ?? "",
    badge:
      folded > 0
        ? `${files} files · ${folded} layers`
        : `${files} ${files === 1 ? "file" : "files"}`,
    internal: facts?.internal ?? 0,
  };
};

/* -------------------------------------------------------------------------- */

const TOGGLE_SIZE = 18;

/**
 * The fold control, as plain SVG.
 *
 * A `<g>` rather than a `<button>` because SVG has no button element and
 * `<foreignObject>` renders inconsistently; the ARIA role and key handling
 * supply what the element does not.
 */
const Toggle = ({
  x,
  y,
  collapsed,
  name,
  onToggle,
}: {
  x: number;
  y: number;
  collapsed: boolean;
  name: string;
  onToggle: () => void;
}): ReactElement => (
  <g
    className="pnd-graph-toggle"
    role="button"
    tabIndex={0}
    aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
    aria-expanded={!collapsed}
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle();
    }}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle();
      }
    }}
  >
    <rect
      x={x}
      y={y}
      width={TOGGLE_SIZE}
      height={TOGGLE_SIZE}
      rx="3"
      className="pnd-graph-toggle-box"
    />
    <text
      x={x + TOGGLE_SIZE / 2}
      y={y + TOGGLE_SIZE / 2}
      className="pnd-graph-toggle-glyph"
    >
      {collapsed ? "+" : "−"}
    </text>
  </g>
);

const GraphNode = ({
  node,
  position,
  state,
  href,
  isContainer,
  onToggle,
}: {
  node: LayoutNode;
  position: LayoutNode;
  state: LayoutState;
  href: string;
  isContainer: boolean;
  onToggle: (() => void) | null;
}): ReactElement => {
  const { name, badge, role, internal } = describe(node.id, state);
  const collapsed = state.facts[node.id]?.collapsed ?? false;

  return (
    <g
      className={`pnd-graph-node pnd-family-${familyOf(node.id)}${
        isContainer ? " pnd-graph-node-container" : ""
      }`}
    >
      <rect
        x={position.x}
        y={position.y}
        width={node.width}
        height={node.height}
        rx="6"
        className="pnd-graph-box"
      >
        <title>{role}</title>
      </rect>

      <a href={href} className="pnd-graph-link">
        <text
          x={position.x + 12}
          y={position.y + 22}
          className="pnd-graph-name"
        >
          {name}
          <title>{role}</title>
        </text>
      </a>

      {isContainer ? null : (
        <text
          x={position.x + 12}
          y={position.y + 42}
          className="pnd-graph-badge"
        >
          {badge}
          {internal > 0 ? ` · ${internal} internal` : ""}
        </text>
      )}

      {onToggle === null ? null : (
        <Toggle
          x={position.x + node.width - TOGGLE_SIZE - 8}
          y={position.y + 8}
          collapsed={collapsed}
          name={name}
          onToggle={onToggle}
        />
      )}
    </g>
  );
};

/* -------------------------------------------------------------------------- */

export const ArchitectureGraph = ({
  hrefPrefix = "/",
  hrefSuffix = "",
  height = "600px",
}: ArchitectureGraphProps): ReactElement => {
  const [collapsed, setCollapsed] = useState<string[]>(
    () => stateByKey.get(layouts.initialState)?.collapsed ?? [],
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const behaviourRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(
    null,
  );

  const state = stateByKey.get(keyFor(collapsed));
  const stateKey = state?.key;

  /**
   * Pan and zoom, attached after mount.
   *
   * Re-attached per fold state, and reset to the identity transform, because
   * each state is an independent layout whose `viewBox` already frames it — so
   * "reset the transform" is the same thing as "fit the new arrangement".
   */
  useEffect(() => {
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    if (svg === null || viewport === null) {
      return undefined;
    }

    const behaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event: { transform: { toString: () => string } }) => {
        viewport.setAttribute("transform", event.transform.toString());
      });

    behaviourRef.current = behaviour;
    const selection = select(svg);
    selection.call(behaviour);
    selection.call(behaviour.transform, zoomIdentity);

    return () => {
      selection.on(".zoom", null);
      behaviourRef.current = null;
    };
  }, [stateKey]);

  const nudge = (factor: number): void => {
    const svg = svgRef.current;
    const behaviour = behaviourRef.current;
    if (svg !== null && behaviour !== null) {
      select(svg).transition().duration(150).call(behaviour.scaleBy, factor);
    }
  };

  const reset = (): void => {
    const svg = svgRef.current;
    const behaviour = behaviourRef.current;
    if (svg !== null && behaviour !== null) {
      select(svg)
        .transition()
        .duration(200)
        .call(behaviour.transform, zoomIdentity);
    }
  };

  const href = (id: string): string =>
    `${hrefPrefix}${layerById.get(id)?.slug ?? ""}${hrefSuffix}`;

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

  const absolute = absolutePositions(state);
  const isContainer = (id: string): boolean =>
    state.nodes.some((other) => other.id.startsWith(`${id}.`));

  return (
    <figure className="pnd pnd-graph">
      <div className="pnd-graph-canvas" style={{ height }}>
        <svg
          ref={svgRef}
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

          <g ref={viewportRef}>
            {/* Edges first, so a node paints over the line that reaches it. */}
            {state.edges.map((edge) => (
              <polyline
                className="pnd-graph-edge"
                key={`${edge.from} ${edge.to}`}
                points={edge.points
                  .map((point) => `${point.x},${point.y}`)
                  .join(" ")}
                strokeWidth={strokeWidth(edge)}
                markerEnd="url(#pnd-arrow)"
                markerStart={edge.reverse > 0 ? "url(#pnd-arrow)" : undefined}
              >
                <title>{edgeTitle(edge)}</title>
              </polyline>
            ))}

            {/* Parents before children, so a container paints behind its contents. */}
            {state.nodes.map((node) => (
              <GraphNode
                key={node.id}
                node={node}
                position={absolute.get(node.id) ?? node}
                state={state}
                href={href(node.id)}
                isContainer={isContainer(node.id)}
                onToggle={
                  layerById.get(node.id)?.expandable
                    ? () => toggle(node.id)
                    : null
                }
              />
            ))}
          </g>
        </svg>

        <div className="pnd-graph-controls">
          <button type="button" onClick={() => nudge(1.3)} aria-label="Zoom in">
            +
          </button>
          <button
            type="button"
            onClick={() => nudge(1 / 1.3)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button type="button" onClick={reset} aria-label="Reset the view">
            ⤢
          </button>
        </div>
      </div>
      <figcaption className="pnd-box-note">
        Click + or − on a layer to fold it. Names link to their page. Drag to
        pan, scroll to zoom.
      </figcaption>
    </figure>
  );
};
