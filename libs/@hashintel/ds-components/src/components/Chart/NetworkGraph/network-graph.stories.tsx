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
  type NetworkGraphId,
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

interface StoryDataset {
  /** Label shown on the dataset switcher button. */
  label: string;
  /** Message shown while this dataset's fixture data loads. */
  loadingLabel: string;
  /** Trims the fixture to the first N nodes; the full dataset when omitted. */
  nodeLimit?: number;
  /**
   * Pre-computed minimum node distance. Supplied for the full dataset only —
   * computing it at render time is O(n²) (see `minDistance`); trimmed datasets
   * are small enough to compute it on the fly.
   */
  precomputedMinDistance?: number;
}

/**
 * The smallest distance between any two distinct points, ignoring points that
 * share a position. O(n²), so only suitable for small inputs — see how the
 * stories below avoid running it over the full ~200k-node fixture.
 */
function minDistance(points: Array<{ x: number; y: number }>): number {
  let min = Infinity;

  for (let index = 0; index < points.length; index++) {
    const from = points[index];
    if (!from) {
      continue;
    }
    for (let other = index + 1; other < points.length; other++) {
      const to = points[other];
      if (!to) {
        continue;
      }
      const dx = from.x - to.x;
      const dy = from.y - to.y;

      // Skip points occupying the same position.
      if (dx === 0 && dy === 0) {
        continue;
      }

      const distance = Math.hypot(dx, dy);

      if (distance < min) {
        min = distance;
      }
    }
  }

  return min;
}

/**
 * Loads the full fixture once. Per-dataset trimming happens downstream (see the
 * `data` memo in {@link NetworkGraphStory}), so switching datasets neither
 * re-fetches nor re-parses the ~23 MB of fixtures — and, crucially, never leaves
 * a trimmed dataset's config paired with the full-size data mid-fetch (which
 * would run the O(n²) `minDistance` over all ~200k nodes and freeze the tab).
 */
const useFullGraphData = (): GraphData | null => {
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
      setData({ points, edges });
    })();
    return () => {
      status.active = false;
    };
  }, []);

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
  a: NetworkGraphId,
  b: NetworkGraphId,
): { fromId: NetworkGraphId; toId: NetworkGraphId } =>
  Math.random() < 0.5 ? { fromId: a, toId: b } : { fromId: b, toId: a };

/**
 * Shared render for the NetworkGraph stories: shows one of `datasets` (fetching
 * the fixture trimmed to that dataset's `nodeLimit`), wires up node/edge
 * selection, and anchors tooltips to the hovered/clicked target. When more than
 * one dataset is given, a toolbar dropdown switches between them.
 */
const NetworkGraphStory = ({
  datasets,
}: {
  // A non-empty list; when it holds more than one entry a switcher dropdown in
  // the toolbar selects between them.
  datasets: readonly [StoryDataset, ...StoryDataset[]];
}) => {
  // Which dataset is currently shown; chosen via the switcher dropdown below.
  const [datasetIndex, setDatasetIndex] = useState(0);
  const dataset = datasets[datasetIndex] ?? datasets[0];
  const fullData = useFullGraphData();
  // The current dataset's view of the fixture, derived synchronously so the
  // dataset config and the data can never fall out of step: the full data, or
  // trimmed to `nodeLimit` with edges filtered to loaded nodes. (Deriving this
  // asynchronously previously left a trimmed dataset paired with the full-size
  // data for a render, running the O(n²) `minDistance` over ~200k nodes.)
  const data = useMemo<GraphData | null>(() => {
    if (!fullData) {
      return null;
    }
    const { nodeLimit } = dataset;
    if (nodeLimit === undefined) {
      return fullData;
    }
    const limitedPoints = fullData.points.slice(0, nodeLimit);
    const loadedIds = new Set(limitedPoints.map((point) => point.id));
    const limitedEdges = fullData.edges.filter(
      (edge) => loadedIds.has(edge.fromId) && loadedIds.has(edge.toId),
    );
    return { points: limitedPoints, edges: limitedEdges };
  }, [fullData, dataset]);
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
    NetworkGraphId | NetworkGraphSelection | null
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

  // Switch datasets, clearing any selection that referred to nodes in the
  // previous (possibly larger) dataset.
  const handleSelectDataset = useCallback((index: number) => {
    setDatasetIndex(index);
    setSelected(null);
    setSelectedEdge(null);
  }, []);

  /** Fixture nodes keyed by id, for resolving edge endpoints in the demo. */
  const pointById = useMemo(() => {
    const map = new Map<NetworkGraphId, NetworkGraphPoint>();
    for (const point of data?.points ?? []) {
      map.set(point.id, point);
    }
    return map;
  }, [data]);

  /**
   * The graph's spatial extent as a bounding box over the node coordinates — the
   * smallest and largest x/y across the nodes — passed through to the chart. Also
   * the basis for `spread` below.
   */
  const graphBounds = useMemo(() => {
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
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    return { minX, maxX, minY, maxY };
  }, [data]);

  /** A small offset (2% of the graph's extent) for scattering overlay nodes. */
  const spread = useMemo(() => {
    if (!data?.points.length) {
      return 100;
    }
    const width = graphBounds.maxX - graphBounds.minX;
    const height = graphBounds.maxY - graphBounds.minY;
    return (Math.hypot(width, height) || 100) * 0.02;
  }, [data, graphBounds]);

  /**
   * The smallest distance between any two nodes, passed to the chart. `minDistance`
   * is O(n²), so the full-dataset Default story passes a `precomputedMinDistance`
   * rather than recomputing it here; the smaller stories compute it on the fly.
   */
  const nodeMinDistance = useMemo(
    () => dataset.precomputedMinDistance ?? minDistance(data?.points ?? []),
    [dataset, data],
  );

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
    const usedNeighbours = new Set<NetworkGraphId>();
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
    // A selection is the explicit `{ point, edges, neighbours }` object; anything
    // else is a node id (string or number).
    if (typeof selected === "object") {
      return selected.point;
    }
    return pointById.get(selected) ?? null;
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
      // Leave the node selection intact. The chart keeps the picked edge
      // highlighted via `selectedEdge`; in the compact view an edge is only drawn
      // while its node is selected, so keeping that node selected is what lets the
      // selected edge stay highlighted there. The node's own tooltip is hidden
      // while an edge is selected (below), so only the edge popover shows.
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
            graphBounds={graphBounds}
            nodeMinDistance={nodeMinDistance}
            selected={selected}
            selectedEdge={selectedEdge?.id ?? null}
            onNodeClick={handleClick}
            onEdgeClick={handleEdgeClick}
            onSelectedPositionChange={setTooltipPos}
            onZoom={setZoom}
          />
          <div className={controlsStyles}>
            {datasets.length > 1 ? (
              <select
                className={buttonStyles}
                value={datasetIndex}
                onChange={(event) =>
                  handleSelectDataset(Number(event.target.value))
                }
                aria-label="Dataset"
              >
                {datasets.map((entry, index) => (
                  <option key={entry.label} value={index}>
                    {entry.label}
                  </option>
                ))}
              </select>
            ) : null}
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
          {selectedPoint && tooltipPos && !selectedEdge ? (
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
          {dataset.loadingLabel}
        </span>
      )}
    </div>
  );
};

/**
 * The minimum distance between any two nodes in the full ~200k-node fixture,
 * pre-computed offline. `minDistance` is O(n²), so running it over the whole
 * dataset at render time would freeze the browser; the smaller stories below are
 * cheap enough to compute it on the fly.
 */
const FULL_DATASET_MIN_DISTANCE = 0.02236067977446914;

/** The full ~200k-node fixture. */
const FULL_DATASET: StoryDataset = {
  label: "Full (~200k nodes)",
  loadingLabel: "Loading ~200k nodes…",
  precomputedMinDistance: FULL_DATASET_MIN_DISTANCE,
};

/** The fixture trimmed to its first 1,000 nodes. */
const ONE_THOUSAND_DATASET: StoryDataset = {
  label: "1,000 nodes",
  loadingLabel: "Loading 1,000 nodes…",
  nodeLimit: 1000,
};

/** The fixture trimmed to its first 10 nodes. */
const TEN_DATASET: StoryDataset = {
  label: "10 nodes",
  loadingLabel: "Loading 10 nodes…",
  nodeLimit: 10,
};

/**
 * A 200k-node / 300k-edge scatterplot rendered with deck.gl. Edges are hidden
 * by default; hover a node to reveal its connections and neighbours, and click a
 * node to inspect it. Scroll to zoom and drag to pan. The toolbar's dataset
 * dropdown switches between the full graph, 1,000 nodes, and 10 nodes.
 */
export const Default: Story<NetworkGraphProps> = () => (
  <NetworkGraphStory
    datasets={[FULL_DATASET, ONE_THOUSAND_DATASET, TEN_DATASET]}
  />
);

/**
 * The same graph trimmed to the first 10 nodes, with edges filtered to those
 * connecting two loaded nodes. A tiny subset for inspecting individual nodes.
 */
export const TenNodes: Story<NetworkGraphProps> = () => (
  <NetworkGraphStory datasets={[TEN_DATASET]} />
);

/**
 * The same graph trimmed to the first 1,000 nodes, with edges filtered to those
 * connecting two loaded nodes. A mid-sized subset between {@link TenNodes} and
 * {@link Default}.
 */
export const OneThousandNodes: Story<NetworkGraphProps> = () => (
  <NetworkGraphStory datasets={[ONE_THOUSAND_DATASET]} />
);
