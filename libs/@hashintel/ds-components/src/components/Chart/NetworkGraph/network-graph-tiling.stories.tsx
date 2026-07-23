import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { LoadingSpinner } from "../../Loading/loading-spinner";
import { iconNameFromEntityIcon } from "./fixtures/entity-icon-name";
import {
  LocatedEntityPopover,
  type LocatedEntityDetail,
  type LocatedEntityEndpoint,
  type LocatedEntityPopoverAnchor,
  type LocatedEntityTypeChip,
} from "./located-entity-popover";
import {
  NetworkGraph,
  type NetworkGraphEdge,
  type NetworkGraphEdgeInteraction,
  type NetworkGraphHandle,
  type NetworkGraphId,
  type NetworkGraphInteraction,
  type NetworkGraphPoint,
  type NetworkGraphSelection,
} from "./network-graph";
import {
  fetchLocate,
  type LocatedEntity,
  type LocateNode,
  type SaltilePropertyValue,
} from "./tiling/fetch-locate";
import {
  tileZoomForViewport,
  useGetViewportNodes,
  WORLD_SIZE,
  type Viewport,
  type ViewportEdge,
  type ViewportNode,
} from "./tiling/use-get-viewport-nodes";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Chart/NetworkGraph/Atlas Tiling",
} satisfies StoryDefault;

/**
 * Same-origin path the story fetches from. A Vite dev proxy (see
 * `vite.config.ts`) forwards it to the local `hash-graph atlas` server, so the
 * browser avoids the CORS block on a direct `127.0.0.1:4003` request.
 */
const ATLAS_PROXY_BASE = "/atlas-api";

/** Aim for roughly this many tiles across the viewport when choosing a depth. */
const TARGET_TILES_ACROSS = 3;
/** Deepest tile zoom the demo requests: the deepest depth the Atlas quadtree addresses. */
const DEMO_MAX_DEPTH = 16;
/** Debounce (ms) on camera changes before refetching, coalescing a pan/zoom drag. */
const DEBOUNCE_MS = 150;
/**
 * Camera max-zoom (absolute orthographic zoom, `2 ** zoom` px per world unit). A
 * cell is one world unit — a depth-16 tile, the finest the quadtree addresses. We
 * cap where one screen dimension shows `max(width, height) / 100` cells, which
 * reduces to 100 px per cell (`2 ** zoom = 100`), independent of canvas size.
 */
const MAX_ZOOM = Math.log2(100);

/**
 * Top slice of the camera zoom range (in zoom levels) over which the displayed
 * tile depth climbs from the {@link TARGET_TILES_ACROSS} baseline density to
 * individual world cells (depth {@link DEMO_MAX_DEPTH}) at the zoom-in limit, so
 * the densest clusters resolve to their real nodes at max zoom without densifying
 * the lower zooms (which keep today's density). See {@link deriveViewport}.
 */
const FULL_DETAIL_ZOOM_BAND = 3;

/**
 * Absolute camera zoom at/above which the graph switches to its detailed view
 * (icons + label pills) and the story requests detailed tile data so those nodes
 * are labelled. `NetworkGraph` flips to detailed at `maxZoom − 0.5` (its detail
 * band is the top 0.5 zoom levels), so matching that here makes the labelled data
 * arrive exactly as the detailed rendering takes over.
 */
const DETAIL_ZOOM = MAX_ZOOM - 0.5;

/**
 * Versioned type URLs sent to the tile API as `coloredTypeIds`. The server
 * returns a per-point type mask keyed by each id's position here, so a node's
 * {@link ViewportNode.typeIndices} indexes straight into {@link TYPE_PALETTE}
 * below. Bit `i` is set when the point is type `i` or one of its descendants.
 */
const COLORED_TYPE_IDS = [
  "http://localhost:3000/@alice/types/entity-type/test-link/v/1",
  "http://localhost:3000/@alice/types/entity-type/test-type/v/1",
  "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
  "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1",
  "https://blockprotocol.org/@hash/types/entity-type/query/v/1",
  "https://hash.ai/@h/types/entity-type/academic-paper/v/1",
  "https://hash.ai/@h/types/entity-type/actor/v/2",
  "https://hash.ai/@h/types/entity-type/actor/v/1",
  "https://hash.ai/@h/types/entity-type/affiliated-with/v/1",
  "https://hash.ai/@h/types/entity-type/aircraft/v/1",
] as const;

/**
 * One distinct colour per {@link COLORED_TYPE_IDS} index (cycled if the type
 * list ever outgrows it), so each queried type reads as its own hue.
 */
const TYPE_PALETTE = [
  "#4f83ff",
  "#12b886",
  "#f59f00",
  "#e8590c",
  "#ae3ec9",
  "#1098ad",
  "#e64980",
  "#7048e8",
  "#66a80f",
  "#f03e3e",
] as const;

/** Node colour for a point matching none of the {@link COLORED_TYPE_IDS}. */
const UNTYPED_COLOR = "#adb5bd";

/**
 * Colours a node by the queried types it carries: the first (lowest-index)
 * matched type wins when a node has several, and an unmatched node reads as
 * {@link UNTYPED_COLOR}.
 */
const colorForTypes = (typeIndices: readonly number[] | undefined): string => {
  const first = typeIndices?.[0];
  if (first === undefined) {
    return UNTYPED_COLOR;
  }
  return TYPE_PALETTE[first % TYPE_PALETTE.length] ?? UNTYPED_COLOR;
};

/** Short legend label from a versioned type URL, e.g. `academic-paper v1`. */
const shortTypeName = (url: string): string => {
  const match = /entity-type\/([^/]+)\/v\/(\d+)/u.exec(url);
  return match ? `${match[1]} v${match[2]}` : url;
};

/**
 * Last meaningful path segment of a property base URL, for the popover — e.g.
 * `https://hash.ai/@h/types/property-type/name/` reads as `name`.
 */
const shortPropName = (url: string): string => {
  const segments = url.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? url;
};

/** A located property value rendered for the popover; `null` reads as an em dash. */
const formatPropValue = (value: SaltilePropertyValue): string =>
  value === null ? "—" : String(value);

interface Camera {
  readonly zoom: number | null;
  readonly center: readonly [number, number] | null;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * The **graphWorld**: the coordinate space node positions live in, and the extent
 * the **tileWorld** (quadtree grid) tiles. For the Atlas dataset that is the full
 * 16-bit axis `[0, WORLD_SIZE)`. {@link deriveViewport} measures tile depth
 * against this — deliberately *not* against the framing bounds passed to
 * `NetworkGraph`, which track where the dataset actually sits so the camera opens
 * bounding the data. Keeping the two apart is the point: the graphWorld fixes the
 * tile grid; the framing bounds decide the opening zoom and pan limits. A
 * consumer whose nodes occupy a different range passes that range as its
 * graphWorld; the **projectionWorld** deck pans within may extend beyond it
 * (those regions resolve to empty tiles).
 */
const GRAPH_WORLD: Bounds = {
  minX: 0,
  maxX: WORLD_SIZE,
  minY: 0,
  maxY: WORLD_SIZE,
};

/**
 * Turns the graph's camera (absolute log2 pixels-per-unit zoom + centre, in
 * graphWorld coordinates — see {@link GRAPH_WORLD}), the container size, and the
 * graph's own bounds into a tiling viewport plus a fractional tile depth.
 *
 * The rectangle the camera shows is clipped to `graphBounds`, so the tiling
 * follows the *visible graph* rather than the raw viewport. When the graph is
 * framed smaller than the viewport (contained and centred, with empty margin
 * around it) only the graph region is tiled — tiling the margin would pull in
 * empty tiles (and, past the graphWorld edge, whole-world/capped tiles), which is
 * what skews the density. Below the top {@link FULL_DETAIL_ZOOM_BAND} zoom levels
 * the depth spans ~{@link TARGET_TILES_ACROSS} tiles (today's density); across
 * that band it climbs to individual cells (depth {@link DEMO_MAX_DEPTH}) so the
 * densest clusters resolve at the zoom-in limit.
 *
 * Returns `null` before the camera reports in (so the first fetch is the
 * overview) or when the camera sits entirely off the graph.
 */
const deriveViewport = (
  camera: Camera,
  size: Size,
  graphBounds: Bounds | null,
): Viewport | null => {
  if (camera.zoom === null || camera.center === null || size.width === 0) {
    return null;
  }
  const scale = 2 ** camera.zoom; // pixels per graphWorld unit
  const [centreX, centreY] = camera.center;
  const halfWidth = size.width / scale / 2;
  const halfHeight = size.height / scale / 2;

  // Clip the camera rectangle to the graph's bounds: tile the visible graph, not
  // the empty margin around a contained graph.
  const x1 = Math.max(centreX - halfWidth, graphBounds?.minX ?? -Infinity);
  const x2 = Math.min(centreX + halfWidth, graphBounds?.maxX ?? Infinity);
  const y1 = Math.max(centreY - halfHeight, graphBounds?.minY ?? -Infinity);
  const y2 = Math.min(centreY + halfHeight, graphBounds?.maxY ?? Infinity);
  if (x2 <= x1 || y2 <= y1) {
    return null; // camera is entirely off the graph
  }

  // Baseline density: ~TARGET_TILES_ACROSS tiles across the visible graph,
  // measured against the graphWorld (its width equals the tileWorld's).
  const graphWorldWidth = GRAPH_WORLD.maxX - GRAPH_WORLD.minX;
  const baseDepth = Math.log2(
    (TARGET_TILES_ACROSS * graphWorldWidth) / (x2 - x1),
  );
  // `fullDetailDepth` is the depth whose tiles are one max-zoom cell on screen —
  // exactly DEMO_MAX_DEPTH when camera.zoom === MAX_ZOOM, for any viewport size.
  // Over the top FULL_DETAIL_ZOOM_BAND zoom levels, blend the target from the
  // baseline toward it: density matches today below the band and climbs to
  // per-cell detail at the zoom-in limit (the descent then fetches the real
  // depth-DEMO_MAX_DEPTH nodes only where dense clusters actually have them).
  const fullDetailDepth = camera.zoom + (DEMO_MAX_DEPTH - MAX_ZOOM);
  const bandStart = MAX_ZOOM - FULL_DETAIL_ZOOM_BAND;
  const detailFraction = Math.max(
    0,
    Math.min(1, (camera.zoom - bandStart) / FULL_DETAIL_ZOOM_BAND),
  );
  const depth = baseDepth + detailFraction * (fullDetailDepth - baseDepth);
  return { x1, x2, y1, y2, zoom: Math.min(depth, DEMO_MAX_DEPTH) };
};

/**
 * Bounding box over points (the dataset extent), falling back to the whole
 * graphWorld when empty. Used as `NetworkGraph`'s framing bounds so the camera
 * opens bounding the data — distinct from {@link GRAPH_WORLD}, which fixes the
 * tile grid.
 */
const boundsOf = (points: readonly NetworkGraphPoint[]): Bounds => {
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
    return GRAPH_WORLD;
  }
  return { minX, maxX, minY, maxY };
};

const toPoint = (node: ViewportNode): NetworkGraphPoint => {
  // `label`/`icon` arrive only once the tile was fetched with detailed data
  // (the detailed view). The graph draws the label in a pill beneath the node
  // and the icon inside it; the server's icon value resolves to a ds icon name.
  const icon = iconNameFromEntityIcon(node.icon);
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    color: colorForTypes(node.typeIndices),
    ...(node.label !== undefined ? { label: node.label } : {}),
    ...(icon !== undefined ? { icon } : {}),
  };
};

const toEdge = (edge: ViewportEdge): NetworkGraphEdge => {
  // `label`/`typeId` arrive only for edges fetched with detailed data. A real
  // consumer resolves the type's icon + label from its own metadata; the story
  // has none, so it shows the link label or the short type name in the pill.
  const label =
    edge.label ??
    (edge.typeId !== undefined ? shortTypeName(edge.typeId) : undefined);
  return {
    id: edge.id,
    fromId: edge.source,
    toId: edge.target,
    ...(label !== undefined ? { label } : {}),
  };
};

/** World coordinates are quantized to an integer grid; show them rounded. */
const formatCoord = (value: number): string =>
  Math.round(value).toLocaleString();

const formatRange = (from: number, to: number): string =>
  `${formatCoord(from)} → ${formatCoord(to)}`;

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
  position: "absolute",
  inset: "0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "3",
  padding: "6",
  color: "neutral.s60",
  fontSize: "sm",
  textAlign: "center",
});

const panelStyles = css({
  position: "absolute",
  top: "3",
  left: "3",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[190px]",
  paddingX: "3",
  paddingY: "2",
  borderRadius: "sm",
  backgroundColor: "[rgba(15, 18, 25, 0.85)]",
  color: "white",
  fontFamily: "mono",
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
  zIndex: "[1]",
  pointerEvents: "none",
});

const panelTitleStyles = css({
  marginBottom: "1",
  fontWeight: "[700]",
});

const panelRowStyles = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "4",
});

const panelHintStyles = css({
  marginTop: "2",
  color: "[rgba(255, 255, 255, 0.6)]",
});

const legendStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  marginTop: "2",
  paddingTop: "2",
  borderTopWidth: "1px",
  borderTopStyle: "solid",
  borderTopColor: "[rgba(255, 255, 255, 0.15)]",
});

const legendRowStyles = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});

const legendSwatchStyles = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "[2px]",
  flexShrink: "0",
});

type Status = "loading" | "idle" | "error";

/** The located item the popover shows, plus the world point "Go to entity" flies to. */
interface Selection {
  readonly detail: LocatedEntityDetail;
  readonly focus: readonly [number, number];
}

/** The type chip for a node's first matched type, or `undefined` when untyped. */
const typeChipForIndices = (
  typeIndices: readonly number[] | undefined,
): LocatedEntityTypeChip | undefined => {
  const index = typeIndices?.[0];
  if (index === undefined) {
    return undefined;
  }
  return {
    label: shortTypeName(COLORED_TYPE_IDS[index] ?? String(index)),
    color: TYPE_PALETTE[index % TYPE_PALETTE.length] ?? UNTYPED_COLOR,
  };
};

/**
 * Drives the tiling pipeline from the graph's live camera: every pan/zoom (and
 * resize) recomputes the viewport and hands it to {@link useGetViewportNodes},
 * which fetches its tiles through a persistent cache and returns the merged
 * nodes plus loading/error state. `graphBounds` and `maxZoom` are stable so
 * streaming new points never reframes the camera. Requires the local Atlas
 * server (proxied via `/atlas-api`).
 */
const AtlasTilingStory = () => {
  const frameRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<NetworkGraphHandle>(null);
  const cameraRef = useRef<Camera>({ zoom: null, center: null });
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const boundsRef = useRef<Bounds | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [detailed, setDetailed] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);

  // What's highlighted: a node (overlaid with its located neighbourhood) or an
  // edge. `anchor` is the selection's live on-screen point (re-reported on
  // zoom/pan, null while off screen); `selection` is the located detail the
  // popover shows plus the world point "Go to entity" reveals.
  const [selected, setSelected] = useState<NetworkGraphSelection | null>(null);
  const [anchor, setAnchor] = useState<LocatedEntityPopoverAnchor | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  // Bumped on every click/clear so a slow earlier locate can't land over a newer one.
  const locateSeqRef = useRef(0);

  const { data, isFetching, isError, error, tileCount } = useGetViewportNodes(
    viewport,
    {
      baseUrl: ATLAS_PROXY_BASE,
      includeDetailedData: detailed,
      coloredTypeIds: COLORED_TYPE_IDS,
    },
  );

  const points = useMemo(() => (data?.nodes ?? []).map(toPoint), [data]);
  const edges = useMemo(() => (data?.edges ?? []).map(toEdge), [data]);

  // Freeze the framing bounds to the dataset extent off the first (overview)
  // load, so the camera opens bounding the data and never reframes as more points
  // stream in. The graphWorld the tiles are measured against stays fixed (see
  // `GRAPH_WORLD`); this only drives the opening zoom and pan limits. Deriving
  // state during render (not in an effect) is React's recommended pattern here.
  if (bounds === null && points.length > 0) {
    setBounds(boundsOf(points));
  }

  // Mirror the framing bounds into a ref so the debounced `deriveViewport` can
  // clip the viewport to the graph without `schedule` depending on `bounds`.
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  const schedule = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      const camera = cameraRef.current;
      setViewport(deriveViewport(camera, sizeRef.current, boundsRef.current));
      // Cross into detailed data on the same threshold the graph uses to switch
      // to its detailed rendering, so nodes are labelled as the view takes over.
      // Both tiles at the target depth and their in-view ancestors refetch
      // detailed (the whole descent), so every visible node shows full details.
      setDetailed(camera.zoom !== null && camera.zoom >= DETAIL_ZOOM);
    }, DEBOUNCE_MS);
  }, []);

  const handleZoom = useCallback(
    (zoom: number, framingBaseZoom: number) => {
      // `onZoom` reports a framing-normalised zoom (0 = fully framed out), but
      // `deriveViewport` needs the absolute world→pixel zoom (`2 ** zoom` px per
      // world unit). Add the framing base back to recover it — without this the
      // framed-out overview reads as zoom 0 and derives the deepest tile depth.
      cameraRef.current = {
        ...cameraRef.current,
        zoom: zoom + framingBaseZoom,
      };
      schedule();
    },
    [schedule],
  );

  const handlePan = useCallback(
    (center: [number, number]) => {
      cameraRef.current = { ...cameraRef.current, center };
      schedule();
    },
    [schedule],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return undefined;
    }
    sizeRef.current = { width: frame.clientWidth, height: frame.clientHeight };
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      sizeRef.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      schedule();
    });
    observer.observe(frame);
    // Initial overview. Deferred through the debounce rather than called
    // synchronously, so the effect doesn't setState during commit.
    schedule();
    return () => {
      observer.disconnect();
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [schedule]);

  // Drop the selection and its popover (empty-space click, or popover dismiss).
  // Bumping the sequence discards any locate still in flight.
  const clearSelection = useCallback(() => {
    locateSeqRef.current += 1;
    setSelected(null);
    setSelection(null);
  }, []);

  // Locate `atlasId`, then apply `onLocated` to the decoded subgraph — but only
  // if this is still the latest click (guards against out-of-order responses).
  const locate = useCallback(
    (atlasId: number, onLocated: (entity: LocatedEntity) => void) => {
      locateSeqRef.current += 1;
      const seq = locateSeqRef.current;
      void fetchLocate(atlasId, {
        baseUrl: ATLAS_PROXY_BASE,
        coloredTypeIds: COLORED_TYPE_IDS,
      })
        .then((entity) => {
          if (seq === locateSeqRef.current) {
            onLocated(entity);
          }
        })
        .catch((locateError: unknown) => {
          if (seq === locateSeqRef.current) {
            // eslint-disable-next-line no-console
            console.error("Atlas locate failed", locateError);
          }
        });
    },
    [],
  );

  // Click a node → locate it and overlay its located neighbourhood, so the node,
  // its edges, and its neighbours are all highlighted (whether or not tiling has
  // them loaded). Clicking empty space clears the selection.
  const handleNodeClick = useCallback(
    (interaction: NetworkGraphInteraction) => {
      if (!interaction.point) {
        clearSelection();
        return;
      }
      locate(Number(interaction.point.id), (entity) => {
        const [source, ...neighbours] = entity.nodes;
        if (!source) {
          return;
        }
        setSelected({
          node: {
            point: toPoint(source),
            edges: entity.edges.map(toEdge),
            neighbours: neighbours.map(toPoint),
          },
        });
        const type = typeChipForIndices(source.typeIndices);
        setSelection({
          detail: {
            kind: "node",
            title: source.label ?? `Node ${source.id}`,
            ...(type !== undefined ? { type } : {}),
            properties: Object.entries(source.properties ?? {}).map(
              ([key, value]) => ({
                key: shortPropName(key),
                value: formatPropValue(value),
              }),
            ),
          },
          focus: [source.x, source.y],
        });
      });
    },
    [clearSelection, locate],
  );

  // Click an edge → select it (its selection outlines both endpoints — an edge's
  // only neighbours). Locate is node-based, so we locate one endpoint node and
  // read the clicked edge's link detail out of that subgraph for the popover.
  const handleEdgeClick = useCallback(
    (interaction: NetworkGraphEdgeInteraction) => {
      const edge = interaction.edge;
      if (!edge) {
        clearSelection();
        return;
      }
      setSelected({ edge: edge.id });
      locate(Number(edge.fromId), (entity) => {
        // The source (index 0) is the endpoint we located the edge through.
        const source = entity.nodes[0];
        if (!source) {
          return;
        }
        const locatedEdge = entity.edges.find((item) => item.id === edge.id);
        // The link's from/to entities, in link direction; the story has no type
        // metadata, so endpoints show labels only.
        const nodeById = new Map(entity.nodes.map((node) => [node.id, node]));
        const endpointFor = (
          node: LocateNode | undefined,
          fallbackId: NetworkGraphId,
        ): LocatedEntityEndpoint => ({
          label: node?.label ?? `Node ${node?.id ?? fallbackId}`,
        });
        setSelection({
          detail: {
            kind: "edge",
            title: locatedEdge?.label ?? `Edge ${edge.id}`,
            types: (locatedEdge?.typeIds ?? []).map((typeId) => ({
              label: shortTypeName(typeId),
              color: UNTYPED_COLOR,
            })),
            endpoints: {
              from: endpointFor(nodeById.get(Number(edge.fromId)), edge.fromId),
              to: endpointFor(nodeById.get(Number(edge.toId)), edge.toId),
            },
            properties: Object.entries(locatedEdge?.properties ?? {}).map(
              ([key, value]) => ({
                key: shortPropName(key),
                value: formatPropValue(value),
              }),
            ),
          },
          focus: [source.x, source.y],
        });
      });
    },
    [clearSelection, locate],
  );

  // "Go to entity" reveals the located point — bringing it on screen if it
  // isn't (a no-op when it already is, e.g. the node you just clicked).
  const handleGoTo = useCallback(() => {
    if (selection) {
      graphRef.current?.revealPoint([selection.focus[0], selection.focus[1]]);
    }
  }, [selection]);

  const status: Status = isError ? "error" : isFetching ? "loading" : "idle";
  const errorMessage = error?.message ?? null;
  const depth = viewport ? tileZoomForViewport(viewport.zoom) : 1;

  return (
    <div ref={frameRef} className={frameStyles}>
      {bounds ? (
        <NetworkGraph
          ref={graphRef}
          points={points}
          edges={edges}
          graphBounds={bounds}
          maxZoom={MAX_ZOOM}
          selected={selected}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onSelectedPositionChange={setAnchor}
          onZoom={handleZoom}
          onPan={handlePan}
        />
      ) : null}

      {selection && anchor ? (
        <LocatedEntityPopover
          triggerRef={frameRef}
          anchor={anchor}
          detail={selection.detail}
          onClose={clearSelection}
          onGoTo={handleGoTo}
        />
      ) : null}

      <div className={panelStyles}>
        <div className={panelTitleStyles}>Atlas tiling</div>
        <div className={panelRowStyles}>
          <span>zoom</span>
          <span>{viewport ? viewport.zoom.toFixed(2) : "—"}</span>
        </div>
        <div className={panelRowStyles}>
          <span>tile depth</span>
          <span>{depth}</span>
        </div>
        <div className={panelRowStyles}>
          <span>detailed data</span>
          <span>{detailed ? "on" : "off"}</span>
        </div>
        <div className={panelRowStyles}>
          <span>viewport x</span>
          <span>{viewport ? formatRange(viewport.x1, viewport.x2) : "—"}</span>
        </div>
        <div className={panelRowStyles}>
          <span>viewport y</span>
          <span>{viewport ? formatRange(viewport.y1, viewport.y2) : "—"}</span>
        </div>
        <div className={panelRowStyles}>
          <span>nodes drawn</span>
          <span>{points.length.toLocaleString()}</span>
        </div>
        <div className={panelRowStyles}>
          <span>edges drawn</span>
          <span>{edges.length.toLocaleString()}</span>
        </div>
        <div className={panelRowStyles}>
          <span>tiles cached</span>
          <span>{tileCount}</span>
        </div>
        <div className={panelRowStyles}>
          <span>status</span>
          <span>{status}</span>
        </div>
        <div className={panelHintStyles}>
          Scroll to zoom, drag to pan, click a node or edge to locate it.
        </div>
        <div className={legendStyles}>
          {COLORED_TYPE_IDS.map((url, index) => (
            <div key={url} className={legendRowStyles}>
              <span
                className={legendSwatchStyles}
                style={{
                  backgroundColor:
                    TYPE_PALETTE[index % TYPE_PALETTE.length] ?? UNTYPED_COLOR,
                }}
              />
              <span>{shortTypeName(url)}</span>
            </div>
          ))}
        </div>
      </div>

      {bounds ? null : (
        <div className={centreStyles}>
          {status === "error" ? (
            <span>
              Couldn&rsquo;t reach the Atlas server. Start it, then reload — the
              story fetches via the <code>/atlas-api</code> dev proxy.
              {errorMessage ? ` (${errorMessage})` : null}
            </span>
          ) : (
            <>
              <LoadingSpinner size="md" />
              Loading Atlas tiles…
            </>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Streams graph nodes and their edges from the live Atlas API over the SALTILE
 * wire (Surface v1) as you navigate: panning and zooming the deck.gl view
 * recomputes the visible quadtree tiles (target depth plus every ancestor),
 * fetches the missing ones through a distance-evicting cache with predictive
 * prefetch, then fetches the edges among the delivered tiles, and re-renders.
 * Each fetch bootstraps a session from `/v1/atlas/current` + the manifest, POSTs
 * tile requests in delta mode, and decodes the binary response zero-copy.
 * Requires the local `hash-graph atlas` server speaking SALTILE (proxied at
 * `/atlas-api`).
 */
export const Default: Story = () => <AtlasTilingStory />;
