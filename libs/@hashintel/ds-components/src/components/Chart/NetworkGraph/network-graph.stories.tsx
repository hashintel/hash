import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { LoadingSpinner } from "../../Loading/loading-spinner";
import { Popover } from "../../Popover/popover";
// Imported with `?url` so the ~23 MB of fixtures are served as static assets
// and parsed at runtime, rather than inlined into the story bundle.
import edgesUrl from "./fixtures/edges.json?url";
import pointsUrl from "./fixtures/points.json?url";
import {
  NetworkGraph,
  type NetworkGraphEdge,
  type NetworkGraphEdgeInteraction,
  type NetworkGraphHandle,
  type NetworkGraphInteraction,
  type NetworkGraphPoint,
  type NetworkGraphProps,
  type NetworkGraphSelection,
} from "./network-graph";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Chart/NetworkGraph",
  argTypes: {},
  args: {},
} satisfies StoryDefault<NetworkGraphProps>;

interface GraphData {
  points: NetworkGraphPoint[];
  edges: NetworkGraphEdge[];
}

/**
 * Loads the fixture data, optionally trimmed to the first `nodeLimit` points.
 * When trimmed, edges are filtered to those whose endpoints are both among the
 * loaded points, so the graph never references a node that isn't present.
 */
const useGraphData = (nodeLimit?: number): GraphData | null => {
  const [data, setData] = useState<GraphData | null>(null);

  useEffect(() => {
    // Mutable holder so the cleanup can cancel a late-arriving fetch without
    // tripping control-flow narrowing on a plain boolean.
    const status = { active: true };
    void (async () => {
      const [points, edges] = await Promise.all([
        fetch(pointsUrl).then(
          (response) => response.json() as Promise<NetworkGraphPoint[]>,
        ),
        fetch(edgesUrl).then(
          (response) => response.json() as Promise<NetworkGraphEdge[]>,
        ),
      ]);
      if (!status.active) {
        return;
      }
      if (nodeLimit === undefined) {
        setData({ points, edges });
        return;
      }
      const limitedPoints = points.slice(0, nodeLimit);
      const loadedIds = new Set(limitedPoints.map((point) => point.id));
      const limitedEdges = edges.filter(
        (edge) => loadedIds.has(edge.fromId) && loadedIds.has(edge.toId),
      );
      setData({ points: limitedPoints, edges: limitedEdges });
    })();
    return () => {
      status.active = false;
    };
  }, [nodeLimit]);

  return data;
};

const frameStyles = css({
  position: "relative",
  width: "full",
  height: "[80vh]",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "neutral.s20",
  borderRadius: "md",
  overflow: "hidden",
});

const centreStyles = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "3",
  width: "full",
  height: "full",
  color: "neutral.s60",
  fontSize: "sm",
});

// Visual chrome only — the `Popover` positioner handles placement and layering.
const tooltipStyles = css({
  paddingX: "3",
  paddingY: "2",
  borderRadius: "sm",
  backgroundColor: "[rgba(15, 18, 25, 0.92)]",
  color: "white",
  fontSize: "xs",
  lineHeight: "snug",
  pointerEvents: "none",
  userSelect: "none",
});

// A small toolbar overlaid on the chart for the demo selection buttons.
const controlsStyles = css({
  position: "absolute",
  top: "3",
  left: "3",
  display: "flex",
  gap: "2",
  zIndex: "[1]",
});

const buttonStyles = css({
  paddingX: "3",
  paddingY: "2",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "neutral.s20",
  backgroundColor: "white",
  color: "neutral.s60",
  fontSize: "xs",
  cursor: "pointer",
});

// A small monospace readout of the current zoom, next to the zoom buttons.
const zoomReadoutStyles = css({
  display: "flex",
  alignItems: "center",
  paddingX: "2",
  color: "neutral.s60",
  fontFamily: "mono",
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
});

/** Pick a random element; throws on an empty array (callers guard). */
const randomChoice = <T,>(items: readonly T[]): T => {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error("randomChoice on an empty array");
  }
  return item;
};

/** A random offset in `[-magnitude, +magnitude]`. */
const jitter = (magnitude: number): number =>
  (Math.random() - 0.5) * 2 * magnitude;

/**
 * Order two node ids into an edge's `fromId`/`toId` a random way round, so the
 * demo's fabricated edges point in both directions rather than always leading
 * away from the selected node.
 */
const randomEdgeDirection = (
  a: number,
  b: number,
): { fromId: number; toId: number } =>
  Math.random() < 0.5 ? { fromId: a, toId: b } : { fromId: b, toId: a };

/**
 * Shared render for the NetworkGraph stories: fetches the fixture data (trimmed
 * to `nodeLimit` when given), wires up node/edge selection, and anchors tooltips
 * to the hovered/clicked target.
 */
const NetworkGraphStory = ({
  nodeLimit,
  loadingLabel,
}: {
  nodeLimit?: number;
  loadingLabel: string;
}) => {
  const data = useGraphData(nodeLimit);
  // The frame is the popover's trigger; `positionFromPoint` then anchors the
  // tooltip at a point measured from the frame's top-left.
  const frameRef = useRef<HTMLDivElement>(null);
  // Imperative handle for driving the zoom from the demo's own +/- buttons,
  // without lifting the view state out of the chart.
  const graphRef = useRef<NetworkGraphHandle>(null);
  // Latest zoom reported by the chart, shown as a readout next to the buttons.
  const [zoom, setZoom] = useState<number | null>(null);
  // The selection driving the chart: a node id (existing node) or an explicit
  // `{ point, edges, neighbours }` neighbourhood to overlay.
  const [selected, setSelected] = useState<
    number | NetworkGraphSelection | null
  >(null);
  // The selected node's live on-screen position and drawn radius, updated by the
  // chart as the user zooms/pans so the tooltip tracks the node and clears it.
  const [tooltipPos, setTooltipPos] = useState<{
    x: number;
    y: number;
    nodeRadius: number;
    variant: "detailed" | "compact";
  } | null>(null);
  // The clicked edge and where it was clicked, for its own popover.
  const [selectedEdge, setSelectedEdge] = useState<NetworkGraphEdge | null>(
    null,
  );
  const [edgeTooltipPos, setEdgeTooltipPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Counter for the ids of fabricated overlay nodes/edges, kept well clear of the
  // fixture's ids so they never collide.
  const nextIdRef = useRef(1_000_000_000);

  /** Fixture nodes keyed by id, for resolving edge endpoints in the demo. */
  const pointById = useMemo(() => {
    const map = new Map<number, NetworkGraphPoint>();
    for (const point of data?.points ?? []) {
      map.set(point.id, point);
    }
    return map;
  }, [data]);

  /** The number of nodes in the graph, passed through to the chart. */
  const numberOfNodes = data?.points.length ?? 0;

  /**
   * The graph's spatial extent — the span between the smallest and largest x/y
   * across the nodes (`width` = maxX − minX, `height` = maxY − minY) — passed
   * through to the chart. Also the basis for `spread` below.
   */
  const graphArea = useMemo(() => {
    const points = data?.points ?? [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX)) {
      return { width: 0, height: 0 };
    }
    return { width: maxX - minX, height: maxY - minY };
  }, [data]);

  /** A small offset (2% of the graph's extent) for scattering overlay nodes. */
  const spread = useMemo(() => {
    if (numberOfNodes === 0) {
      return 100;
    }
    return (Math.hypot(graphArea.width, graphArea.height) || 100) * 0.02;
  }, [numberOfNodes, graphArea]);

  /** A brand-new node at `(x, y)`, borrowing a random colour/icon from the graph. */
  const createNewPoint = useCallback(
    (x: number, y: number): NetworkGraphPoint => {
      const palette = data?.points ?? [];
      const sample = palette.length > 0 ? randomChoice(palette) : undefined;
      return {
        id: nextIdRef.current++,
        x,
        y,
        color: sample?.color ?? "#7d8bb0",
        icon: sample?.icon,
      };
    },
    [data],
  );

  /** Selects a wholly new node with new random edges + neighbours (all overlaid). */
  const handleSelectNew = useCallback(() => {
    if (!data || data.points.length === 0) {
      return;
    }
    // Place the new node near an existing one so it lands in a populated area.
    const anchor = randomChoice(data.points);
    const point = createNewPoint(
      anchor.x + jitter(spread),
      anchor.y + jitter(spread),
    );
    const neighbours: NetworkGraphPoint[] = [];
    const edges: NetworkGraphEdge[] = [];
    const count = 3 + Math.floor(Math.random() * 4);
    for (let index = 0; index < count; index += 1) {
      const neighbour = createNewPoint(
        point.x + jitter(spread),
        point.y + jitter(spread),
      );
      neighbours.push(neighbour);
      edges.push({
        id: nextIdRef.current++,
        ...randomEdgeDirection(point.id, neighbour.id),
      });
    }
    setSelected({ point, edges, neighbours });
    setSelectedEdge(null);
    // Reveal the new node if it landed outside the current viewport, keeping the
    // previous centre in view too.
    graphRef.current?.revealPoint([point.x, point.y]);
  }, [data, spread, createNewPoint]);

  /**
   * Selects an existing node with a ~50/50 mix of its real edges/neighbours and
   * fabricated new ones — exercising the "reuse existing, overlay new" path.
   */
  const handleSelectMixed = useCallback(() => {
    if (!data || data.edges.length === 0) {
      return;
    }
    // Seed on an existing edge so the chosen node is guaranteed real connections.
    const point = pointById.get(randomChoice(data.edges).fromId);
    if (!point) {
      return;
    }
    const perSide = 3;
    const existingEdges: NetworkGraphEdge[] = [];
    const existingNeighbours: NetworkGraphPoint[] = [];
    const usedNeighbours = new Set<number>();
    for (const edge of data.edges) {
      if (existingEdges.length >= perSide) {
        break;
      }
      if (edge.fromId !== point.id && edge.toId !== point.id) {
        continue;
      }
      const otherId = edge.fromId === point.id ? edge.toId : edge.fromId;
      const other = pointById.get(otherId);
      if (!other || usedNeighbours.has(other.id)) {
        continue;
      }
      usedNeighbours.add(other.id);
      existingEdges.push(edge);
      existingNeighbours.push(other);
    }
    const newNeighbours: NetworkGraphPoint[] = [];
    const newEdges: NetworkGraphEdge[] = [];
    for (let index = 0; index < perSide; index += 1) {
      const neighbour = createNewPoint(
        point.x + jitter(spread),
        point.y + jitter(spread),
      );
      newNeighbours.push(neighbour);
      newEdges.push({
        id: nextIdRef.current++,
        fromId: point.id,
        toId: neighbour.id,
      });
    }
    setSelected({
      point,
      edges: [...existingEdges, ...newEdges],
      neighbours: [...existingNeighbours, ...newNeighbours],
    });
    setSelectedEdge(null);
  }, [data, pointById, spread, createNewPoint]);

  /** The selected node itself, for the tooltip (resolved from either form). */
  const selectedPoint = useMemo(() => {
    if (selected == null) {
      return null;
    }
    if (typeof selected === "number") {
      return pointById.get(selected) ?? null;
    }
    return selected.point;
  }, [selected, pointById]);

  const handleClick = useCallback((interaction: NetworkGraphInteraction) => {
    setSelected(interaction.point?.id ?? null);
    // A node click closes any open edge popover.
    setSelectedEdge(null);
  }, []);

  const handleEdgeClick = useCallback(
    (interaction: NetworkGraphEdgeInteraction) => {
      // Anchor the edge popover at the click point. (Unlike the node tooltip it
      // doesn't track pan/zoom — the node position is reported back by the chart,
      // an edge's isn't — which is fine for this demo.)
      setSelectedEdge(interaction.edge);
      setEdgeTooltipPos({ x: interaction.x, y: interaction.y });
    },
    [],
  );

  return (
    <div ref={frameRef} className={frameStyles}>
      {data ? (
        <>
          <NetworkGraph
            ref={graphRef}
            points={data.points}
            edges={data.edges}
            graphArea={graphArea}
            numberOfNodes={numberOfNodes}
            selected={selected}
            onNodeClick={handleClick}
            onEdgeClick={handleEdgeClick}
            onSelectedPositionChange={setTooltipPos}
            onZoom={setZoom}
          />
          <div className={controlsStyles}>
            <button
              type="button"
              className={buttonStyles}
              onClick={handleSelectNew}
            >
              Select new node
            </button>
            <button
              type="button"
              className={buttonStyles}
              onClick={handleSelectMixed}
            >
              Select existing + mix
            </button>
            {/* Drive the chart's internal zoom via its imperative handle. */}
            <button
              type="button"
              className={buttonStyles}
              onClick={() => graphRef.current?.zoomOut()}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className={buttonStyles}
              onClick={() => graphRef.current?.zoomIn()}
              aria-label="Zoom in"
            >
              +
            </button>
            {zoom !== null ? (
              <span className={zoomReadoutStyles}>{zoom.toFixed(2)}</span>
            ) : null}
          </div>
          {selectedPoint && tooltipPos ? (
            <Popover
              triggerRef={frameRef}
              position="bottom-start"
              positionFromPoint={tooltipPos}
              onClose={() => setSelected(null)}
              // Sit the tooltip clear of the node by offsetting both gaps by the
              // node's drawn radius (larger in the detailed view, where nodes are
              // bigger).
              gapX={
                tooltipPos.nodeRadius +
                (tooltipPos.variant === "compact" ? 5 : 3)
              }
              gapY={
                tooltipPos.nodeRadius +
                (tooltipPos.variant === "compact" ? 0 : 3)
              }
            >
              <div className={tooltipStyles}>
                <div>Node {selectedPoint.id}</div>
                <div>
                  ({selectedPoint.x.toFixed(1)}, {selectedPoint.y.toFixed(1)})
                </div>
              </div>
            </Popover>
          ) : null}
          {selectedEdge && edgeTooltipPos ? (
            <Popover
              triggerRef={frameRef}
              position="bottom-start"
              positionFromPoint={edgeTooltipPos}
              onClose={() => setSelectedEdge(null)}
              gapX={10}
              gapY={12}
            >
              <div className={tooltipStyles}>
                <div>Edge {selectedEdge.id}</div>
                <div>
                  Node {selectedEdge.fromId} → Node {selectedEdge.toId}
                </div>
              </div>
            </Popover>
          ) : null}
        </>
      ) : (
        <span className={centreStyles}>
          <LoadingSpinner size="md" />
          {loadingLabel}
        </span>
      )}
    </div>
  );
};

/**
 * A 200k-node / 300k-edge scatterplot rendered with deck.gl. Edges are hidden
 * by default; hover a node to reveal its connections and neighbours, and click a
 * node to inspect it. Scroll to zoom and drag to pan.
 */
export const Default: Story<NetworkGraphProps> = () => (
  <NetworkGraphStory loadingLabel="Loading ~200k nodes…" />
);

/**
 * The same graph trimmed to the first 10 nodes, with edges filtered to those
 * connecting two loaded nodes. A tiny subset for inspecting individual nodes.
 */
export const TenNodes: Story<NetworkGraphProps> = () => (
  <NetworkGraphStory nodeLimit={10} loadingLabel="Loading 10 nodes…" />
);

/**
 * The same graph trimmed to the first 1,000 nodes, with edges filtered to those
 * connecting two loaded nodes. A mid-sized subset between {@link TenNodes} and
 * {@link Default}.
 */
export const OneThousandNodes: Story<NetworkGraphProps> = () => (
  <NetworkGraphStory nodeLimit={1000} loadingLabel="Loading 1,000 nodes…" />
);
