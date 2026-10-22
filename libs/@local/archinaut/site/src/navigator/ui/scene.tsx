/**
 * The drawing: boxes for layers, chips for interfaces, dashed boxes for
 * externals, curves for edges. Positions come from the map or focus layout
 * and glide between them; filters change opacity, never positions, so the
 * taxonomy stays where the reader learned it.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { classFor, layerPalette } from "../../../../src/bundle/shared/palette";
import {
  isExternalId,
  isInterface,
  isInterfaceId,
  isLayer,
  shortName,
  summaryOf,
} from "../model/graph";
import { focusLayout } from "../model/layout/focus-layout";
import { edgeGeometry } from "../model/layout/geometry";
import { mapLayout } from "../model/layout/map-layout";
import { boundsOf, type Box, type PlacedNode } from "../model/layout/types";
import { pageSlugOf } from "../model/pages";
import {
  audienceMembers,
  domainMembers,
  neighbourhood,
  projectEdges,
  searchMatches,
  type ProjectedEdge,
} from "../model/projections";
import { fitAll, focusOn, select } from "../view-state";
import { useNavigator } from "./navigator-context";
import { useTween } from "./use-tween";

const viewId = "__view";
const dimmed = 0.16;
const initialView: Box = { x: 0, y: 0, width: 1000, height: 600 };
/** A small region still shows some of its surroundings. */
const minimumRegionWidth = 900;

const widened = (box: Box, width: number): Box => {
  if (box.width >= width) {
    return box;
  }
  const grow = (width - box.width) / 2;
  return {
    x: box.x - grow,
    y: box.y - (grow * box.height) / box.width,
    width,
    height: box.height + (2 * grow * box.height) / box.width,
  };
};

const transportGlyph: Record<string, string> = {
  call: "ƒ",
  postMessage: "⇄",
  "stdio-jsonl": "⌘",
  http: "⌁",
  registration: "⊕",
  "pyodide-fs": "⧉",
};

/** The colours a node is drawn in: the diagrams' palette, themed by the host. */
const colours = (id: string): CSSProperties => {
  if (isInterfaceId(id)) {
    return {
      "--nav-fill": "var(--nav-interface-fill)",
      "--nav-stroke": "var(--nav-interface-stroke)",
    } as CSSProperties;
  }
  if (isExternalId(id)) {
    return {
      "--nav-fill": "var(--nav-external-fill)",
      "--nav-stroke": "var(--nav-external-stroke)",
    } as CSSProperties;
  }
  const family = classFor(id);
  const palette = layerPalette[family] ?? { fill: "#f2f2f2", stroke: "#777" };
  return {
    "--nav-fill": `var(--pnd-diagram-${family}-fill, ${palette.fill})`,
    "--nav-stroke": `var(--pnd-diagram-${family}-stroke, ${palette.stroke})`,
  } as CSSProperties;
};

const truncate = (text: string, width: number): string => {
  const capacity = Math.max(4, Math.floor((width - 24) / 6.6));
  return text.length <= capacity ? text : `${text.slice(0, capacity - 1)}…`;
};

/** Client coordinates → SVG user coordinates, through the current viewBox. */
const toUserPoint = (
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } => {
  const matrix = svg.getScreenCTM();
  if (matrix === null) {
    return { x: clientX, y: clientY };
  }
  const point = new DOMPoint(clientX, clientY).matrixTransform(
    matrix.inverse(),
  );
  return { x: point.x, y: point.y };
};

const arrowKinds = ["imports", "declared", "interface-pair", "spoke"] as const;

const Markers = () => (
  <defs>
    {arrowKinds.map((kind) => (
      <marker
        key={kind}
        id={`nav-marker-${kind}`}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="8"
        markerHeight="8"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" className={`nav-marker-${kind}`} />
      </marker>
    ))}
    <marker
      id="nav-marker-provides"
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="8"
      markerHeight="8"
      orient="auto"
    >
      <circle cx="5" cy="5" r="3.5" className="nav-marker-provides" />
    </marker>
  </defs>
);

export const Scene = () => {
  const { index, pages, state, update, open } = useNavigator();
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewOverride, setViewOverride] = useState<Box | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(16 / 9);
  // What the pointer handlers read, since they run outside render.
  const viewRef = useRef<Box>(initialView);
  const dragRef = useRef<{
    pointerId: number;
    origin: { x: number; y: number };
    view: Box;
    moved: boolean;
  } | null>(null);

  // The tween keys on the identity of its target, so these stay memoised by
  // hand: a rebuilt map every render would restart the glide every frame.
  const edges = useMemo(
    () => projectEdges(index, state.projection, state.edgeKinds),
    [index, state.projection, state.edgeKinds],
  );
  const baseLayout = useMemo(() => mapLayout(index, aspect), [index, aspect]);
  const layout = useMemo(
    () =>
      state.mode === "focus" && state.focus !== null
        ? focusLayout(
            index,
            state.focus,
            neighbourhood(index, state.focus, edges),
          )
        : baseLayout,
    [index, state.mode, state.focus, edges, baseLayout],
  );
  const showChips =
    state.projection === "hypergraph" && state.edgeKinds.interfaces;
  // The view is a node of the tween too, so a change of region glides.
  const region = state.mode === "map" ? state.region : null;
  const target = useMemo(() => {
    const nodes = new Map<string, PlacedNode>();
    for (const [id, node] of layout.nodes) {
      if (!showChips && isInterfaceId(id)) {
        continue;
      }
      nodes.set(id, node);
    }
    const regionBox = region === null ? undefined : layout.nodes.get(region);
    const bounds =
      regionBox === undefined
        ? boundsOf(nodes.values(), 48)
        : widened(boundsOf([regionBox], 60), minimumRegionWidth);
    nodes.set(viewId, { id: viewId, ...bounds, depth: 0, container: false });
    return nodes;
  }, [layout, showChips, region]);

  // A new mode, focus, projection or region re-fits the view; a manual pan
  // or zoom survives everything else.
  const viewKey = `${state.mode}:${state.focus ?? ""}:${state.projection}:${region ?? ""}`;
  const [previousViewKey, setPreviousViewKey] = useState(viewKey);
  if (viewKey !== previousViewKey) {
    setPreviousViewKey(viewKey);
    setViewOverride(null);
  }

  const positions = useTween(target, 480);
  const fitted = positions.get(viewId);
  const view: Box = viewOverride ?? fitted ?? initialView;

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // The map wraps its rows to the drawing's shape, measured coarsely so a
  // rail resizing does not re-lay it out on every pixel.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry?.contentRect ?? { width: 0, height: 0 };
      if (width > 0 && height > 0) {
        setAspect(Math.round((width / height) * 4) / 4);
      }
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) {
      return undefined;
    }
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const base = viewRef.current;
      const pivot = toUserPoint(svg, event.clientX, event.clientY);
      const scale = Math.min(
        4,
        Math.max(0.25, Math.exp(event.deltaY * 0.0016)),
      );
      const width = Math.min(30000, Math.max(160, base.width * scale));
      const ratio = width / base.width;
      setViewOverride({
        x: pivot.x - (pivot.x - base.x) * ratio,
        y: pivot.y - (pivot.y - base.y) * ratio,
        width,
        height: base.height * ratio,
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const domain = domainMembers(index, state.tags);
  const audience = audienceMembers(index, state.audience);
  const matches = searchMatches(index, state.query);

  const adjacency = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    adjacency.set(from, (adjacency.get(from) ?? new Set<string>()).add(to));
  };
  for (const edge of edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }

  const isMember = (id: string): boolean =>
    (domain === null || domain.has(id)) &&
    (audience === null || audience.has(id)) &&
    (matches === null || matches.has(id));

  const spotlight = hovered ?? state.selected;
  const emphasisOf = (id: string): number => {
    if (id === spotlight || id === state.focus) {
      return 1;
    }
    if (spotlight !== null && adjacency.get(spotlight)?.has(id)) {
      return 1;
    }
    return isMember(id) ? 1 : dimmed;
  };

  const edgeOpacity = (edge: ProjectedEdge): number => {
    if (
      spotlight !== null &&
      (edge.from === spotlight || edge.to === spotlight)
    ) {
      return 1;
    }
    if (spotlight !== null) {
      return 0.08;
    }
    if (!isMember(edge.from) || !isMember(edge.to)) {
      return 0.05;
    }
    // Imports are the many; they stay a texture until something is selected.
    return edge.kind === "imports" ? 0.3 : 0.75;
  };

  const onBackgroundPointerDown = (
    event: ReactPointerEvent<SVGRectElement>,
  ): void => {
    if (event.button !== 0) {
      return;
    }
    const svg = svgRef.current;
    if (svg === null) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      origin: toUserPoint(svg, event.clientX, event.clientY),
      view,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onBackgroundPointerMove = (
    event: ReactPointerEvent<SVGRectElement>,
  ): void => {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (drag === null || svg === null || drag.pointerId !== event.pointerId) {
      return;
    }
    const point = toUserPoint(svg, event.clientX, event.clientY);
    // The drag origin was measured in the view captured at pointer-down, so
    // the delta is taken against that view rather than the moving one.
    const current = viewRef.current;
    const scale = drag.view.width / current.width;
    drag.moved = true;
    setViewOverride({
      ...drag.view,
      x: drag.view.x - (point.x - drag.origin.x) * scale,
      y: drag.view.y - (point.y - drag.origin.y) * scale,
    });
  };

  const onBackgroundPointerUp = (
    event: ReactPointerEvent<SVGRectElement>,
  ): void => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      if (!drag.moved) {
        update((current) => select(current, null));
      }
    }
  };

  const placed = [...positions.entries()]
    .filter(([id]) => id !== viewId)
    .sort(
      ([, left], [, right]) =>
        Number(right.container) - Number(left.container) ||
        left.depth - right.depth,
    );
  const containers = placed.filter(([, box]) => box.container);
  const leaves = placed.filter(([, box]) => !box.container);

  const renderNode = ([id, box]: [string, PlacedNode]) => {
    const node = index.nodes.get(id);
    if (node === undefined) {
      return null;
    }
    const slug = pageSlugOf(id);
    const hasPage = slug !== null && pages.has(slug);
    const classes = [
      "nav-node",
      isInterface(node) ? "interface" : isLayer(node) ? "layer" : "external",
      box.container ? "container" : "leaf",
      id === state.selected ? "selected" : "",
      id === state.focus ? "focused" : "",
      hasPage ? "linked" : "",
    ].join(" ");
    const label = isInterface(node)
      ? `${transportGlyph[node.transport] ?? "ƒ"} ${node.name}`
      : shortName(node);
    return (
      <g
        key={id}
        className={classes}
        style={colours(id)}
        transform={`translate(${box.x.toFixed(1)} ${box.y.toFixed(1)})`}
        opacity={emphasisOf(id)}
        onClick={(event) => {
          event.stopPropagation();
          update((current) => select(current, id));
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (hasPage) {
            open(slug);
          } else {
            update((current) => focusOn(current, id));
          }
        }}
        onPointerEnter={() => setHovered(id)}
        onPointerLeave={() => setHovered(null)}
      >
        <title>
          {`${isLayer(node) ? node.id : node.name}\n${summaryOf(node)}`}
        </title>
        <rect
          width={box.width}
          height={box.height}
          rx={isInterface(node) ? box.height / 2 : box.container ? 10 : 8}
        />
        {isInterface(node) ? (
          <text
            className="nav-label"
            x={box.width / 2}
            y={box.height / 2 + 4}
            textAnchor="middle"
          >
            {truncate(label, box.width)}
          </text>
        ) : (
          <>
            <text className="nav-label" x={10} y={box.container ? 20 : 19}>
              {truncate(label, box.width)}
            </text>
            {!box.container && isLayer(node) ? (
              <text className="nav-facts" x={10} y={35}>
                {node.fileCount} files · {node.lineCount} lines
              </text>
            ) : null}
            {!box.container && !isLayer(node) ? (
              <text className="nav-facts" x={10} y={35}>
                outside the codebase
              </text>
            ) : null}
          </>
        )}
      </g>
    );
  };

  const renderEdge = (edge: ProjectedEdge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (from === undefined || to === undefined || edge.from === edge.to) {
      return null;
    }
    const bend = edge.kind === "spoke" ? 0 : edge.from < edge.to ? 0.12 : -0.12;
    const geometry = edgeGeometry(from, to, bend);
    const strong =
      spotlight !== null && (edge.from === spotlight || edge.to === spotlight);
    const showLabel = edge.label !== null && (strong || state.mode === "focus");
    const marker =
      edge.kind === "implements" ||
      edge.role === "provides" ||
      edge.role === "implements"
        ? "url(#nav-marker-provides)"
        : edge.role === "defines"
          ? undefined
          : `url(#nav-marker-${edge.kind})`;
    return (
      <g
        key={edge.id}
        className={`nav-edge kind-${edge.kind} role-${edge.role ?? "none"}${strong ? " strong" : ""}`}
        opacity={edgeOpacity(edge)}
      >
        <path
          d={geometry.d}
          strokeWidth={
            edge.kind === "imports" ? 1 + Math.log2(edge.weight) * 0.6 : 1.4
          }
          markerEnd={marker}
        />
        {showLabel ? (
          <text
            className="nav-edge-label"
            x={geometry.mid.x}
            y={geometry.mid.y - 4}
            textAnchor="middle"
          >
            {edge.label}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <div className="nav-scene">
      <svg
        ref={svgRef}
        className="nav-canvas"
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Markers />
        <rect
          className="nav-background"
          x={view.x - view.width}
          y={view.y - view.height}
          width={view.width * 3}
          height={view.height * 3}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onBackgroundPointerMove}
          onPointerUp={onBackgroundPointerUp}
          onPointerCancel={onBackgroundPointerUp}
        />
        <g className="nav-containers">{containers.map(renderNode)}</g>
        <g className="nav-edges">{edges.map(renderEdge)}</g>
        <g className="nav-leaves">{leaves.map(renderNode)}</g>
      </svg>
      <div className="nav-scene-controls">
        <button
          type="button"
          className="nav-button"
          onClick={() => {
            setViewOverride(null);
            update(fitAll);
          }}
          title="Fit the whole map"
        >
          Fit all
        </button>
        <span className="nav-hint">
          {state.mode === "focus"
            ? "Esc returns to the map"
            : "Click selects · double-click opens the page · scroll zooms · drag pans"}
        </span>
      </div>
    </div>
  );
};
