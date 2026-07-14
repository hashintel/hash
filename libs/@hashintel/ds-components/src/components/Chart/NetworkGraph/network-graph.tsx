import { OrthographicView } from "@deck.gl/core";
import {
  IconLayer,
  LineLayer,
  ScatterplotLayer,
  TextLayer,
} from "@deck.gl/layers";
import { DeckGL, type DeckGLRef } from "@deck.gl/react";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { css, cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../../Icon/icon";

import type { IconName } from "../../Icon/icon";
import type { Color, OrthographicViewState, PickingInfo } from "@deck.gl/core";

/** A single node in the graph. Positions live in an abstract 2D space. */
export interface NetworkGraphPoint {
  id: number;
  x: number;
  y: number;
  /** CSS hex colour (e.g. `#FF8C26`) used for the node. */
  color: string;
  /**
   * Optional label. Shown in a pill beneath the node in the zoomed-in detail
   * variation; ignored at lower zoom levels.
   */
  label?: string;
  /**
   * Optional icon. Rendered inside the node in the zoomed-in detail variation;
   * ignored at lower zoom levels.
   */
  icon?: IconName;
}

/** A connection between two {@link NetworkGraphPoint}s, referenced by `id`. */
export interface NetworkGraphEdge {
  id: number;
  fromId: number;
  toId: number;
}

/** A pointer interaction (hover or click) with the network graph. */
export interface NetworkGraphInteraction {
  /** The node under the pointer, or `null` when over empty space. */
  point: NetworkGraphPoint | null;
  /** Pointer x position in pixels, relative to the chart's top-left corner. */
  x: number;
  /** Pointer y position in pixels, relative to the chart's top-left corner. */
  y: number;
}

export interface NetworkGraphProps {
  /** The nodes to plot. */
  points: NetworkGraphPoint[];
  /** The connections between nodes. Only rendered while a node is hovered. */
  edges: NetworkGraphEdge[];
  /** Extra class name applied to the chart container. */
  className?: string;
  /**
   * Id of a node to highlight with the same treatment as hovering (edges,
   * neighbour rings and a prominent node). An active hover takes precedence.
   */
  selected?: number | null;
  /**
   * Called with the `selected` node's current on-screen position (CSS pixels,
   * relative to the chart's top-left) whenever it changes — including as the
   * user zooms or pans — or `null` when nothing is selected. Lets a consumer
   * anchor an overlay such as a tooltip to the node.
   */
  onSelectedPositionChange?: (
    position: { x: number; y: number } | null,
  ) => void;
  /**
   * Called when the hovered node changes, with the newly hovered node (or
   * `null` when the pointer leaves all nodes) and its pixel position. Not called
   * while the pointer stays over the same node.
   */
  onNodeHover?: (interaction: NetworkGraphInteraction) => void;
  /**
   * Called when the chart is clicked, with the clicked node (or `null` when
   * empty space is clicked) and its pixel position.
   */
  onNodeClick?: (interaction: NetworkGraphInteraction) => void;
  /**
   * Called when the zoom level changes, with the new zoom as a single number
   * (orthographic zoom is log2 scale). Not called for pure panning.
   */
  onZoom?: (zoom: number) => void;
}

const RGBA_OPAQUE = 255;
/** Colour used if a point's hex value cannot be resolved. */
const FALLBACK_COLOR: [number, number, number] = [148, 148, 148];
const POINT_RADIUS = 0.1;
/** Minimum on-screen radius (px) of the hovered node, so it stays prominent. */
const HOVERED_MIN_RADIUS = 8;
/** Minimum on-screen radius (px) of the hovered node's connected neighbours. */
const NEIGHBOUR_MIN_RADIUS = 5;
/**
 * How strongly the point radius grows with zoom. At `0` the radius is fixed in
 * screen pixels; at `1` it scales 1:1 with the zoom's linear scale factor. `0.8`
 * grows the radius slightly sub-linearly as you zoom in.
 */
const ZOOM_RADIUS_RATE = 1;
/** Zoom range relative to the initial framing — how far out/in the user can zoom. */
const MIN_ZOOM_OFFSET = -2;
const MAX_ZOOM_OFFSET = 7;
/** Furthest zoom-out keeps the whole network in view plus this fractional margin. */
const ZOOM_OUT_MARGIN = 0.2;
/** Screen-space padding (px) the viewport may show beyond the network when panning. */
const PAN_PADDING_PX = 10;
/** Pointer travel (px) above which a release is treated as a pan, not a click. */
const CLICK_MOVE_THRESHOLD_PX = 4;
/** Picking radius (px) used to resolve the node under a click. */
const CLICK_PICK_RADIUS_PX = 4;
const EDGE_COLOR = [80, 88, 110] as const;
/** Base opacity of the points — subtly transparent so dense areas read as depth. */
const POINT_OPACITY = 1;
/** Opacity of the points faded into the background while a node is hovered. */
const POINT_DIMMED_OPACITY = 1;
/** Point opacity when zoomed all the way out; fades in to {@link POINT_OPACITY} at mid-zoom. */
const POINT_MIN_OPACITY = 0.5;
/** Zoom-range fraction at/above which points are fully opaque (below, they fade out as you zoom out). */
const OPACITY_FULL_FRACTION = 0.5;
/**
 * Zoom offset (relative to the reference framing) at/above which the node layer
 * switches from plain points to the detailed variation — larger nodes showing
 * their icon and label pill. Sits just below the max so the final zoom-in reveals it.
 */
const DETAIL_ZOOM_OFFSET = MAX_ZOOM_OFFSET - 0.5;
/** Diameter (px) of a node in the zoomed-in detail variation. */
const DETAIL_NODE_DIAMETER = 40;
/** On-screen size (px) of the icon drawn inside a detail node. */
const DETAIL_ICON_SIZE = 24;
/** Resolution (px) each icon is rasterised at in the mask atlas. */
const DETAIL_ICON_TEXTURE = 64;
/** Font size (px) of the detail label text. */
const DETAIL_LABEL_FONT_SIZE = 12;
/** Font stack the label text is rasterised with. */
const DETAIL_LABEL_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
/** Longest label (chars) before it is truncated with an ellipsis (~2.5× node width). */
const DETAIL_LABEL_MAX_CHARS = 16;
/**
 * Downward pixel offset of the label from the node centre. Equal to the node
 * radius, so the label's text starts just below the node's bottom edge (the
 * pill's padding tucks a couple of pixels behind the node, which is drawn on top).
 */
const DETAIL_LABEL_OFFSET = DETAIL_NODE_DIAMETER / 2;
/** Background padding `[x, y]` of the label pill. */
const DETAIL_LABEL_PADDING: [number, number] = [6, 2];
/** Background padding `[x, y]` of the label's outline halo — larger, so it rings the pill. */
const DETAIL_LABEL_HALO_PADDING: [number, number] = [8, 4];
/** Corner radius (px) of the label pill. */
const DETAIL_LABEL_RADIUS = 9;
/** Corner radius (px) of the label's outline halo (rounds the outline to match). */
const DETAIL_LABEL_HALO_RADIUS = 11;
/** Ring width (px) around an idle (not hovered/selected) node and its label. */
const DETAIL_OUTLINE_WIDTH_IDLE = 1.5;
/** Ring width (px) around an active (hovered/selected) node and its label. */
const DETAIL_OUTLINE_WIDTH_ACTIVE = 3;
/** How far (px) the active node's translucent glow extends beyond its radius. */
const DETAIL_GLOW_EXTENT = 7;
/** Alpha (0–255) of the active node's translucent glow. */
const DETAIL_GLOW_ALPHA = 80;
/** Opaque white, used for node/label fills and the idle outline. */
const DETAIL_WHITE: Color = [255, 255, 255, 255];
/** Fully transparent, used to hide the halo's (invisible) text. */
const DETAIL_TRANSPARENT: Color = [0, 0, 0, 0];
/** Dark ink for the label text. */
const DETAIL_INK: Color = [15, 18, 25, 255];
/**
 * Cap on how many detail nodes are fed to the detail layers at once — a safety
 * net for dense clusters; at max zoom only a handful are ever in view.
 */
const DETAIL_MAX_NODES = 400;
/**
 * Extra viewport margin (px) within which nodes are still included, so a node
 * (or its label) straddling the edge isn't culled away.
 */
const DETAIL_VIEWPORT_MARGIN_PX = 80;
/**
 * The detail parts are drawn in separate deck.gl layers (one per part), so
 * across-layer draw order alone would let a back node's icon/label show over a
 * front node. Instead each node's parts share a per-node depth *band* via the z
 * coordinate, with the depth buffer resolving occlusion: every part of a nearer
 * node beats every part of a node behind it. Within a band the parts stack
 * `glow < halo < label < circle < icon` (back to front). `DETAIL_Z_STEP` is the
 * world-z gap between adjacent levels — tiny, but far above the orthographic
 * depth buffer's resolution.
 */
const DETAIL_Z_STEP = 0.001;
const DETAIL_LEVEL_GLOW = 0;
const DETAIL_LEVEL_HALO = 1;
const DETAIL_LEVEL_LABEL = 2;
const DETAIL_LEVEL_CIRCLE = 3;
const DETAIL_LEVEL_ICON = 4;
const DETAIL_LEVEL_COUNT = 5;
/**
 * The base layers all sit at z 0 and must never occlude the detail layers (which
 * use negative z, see {@link detailZ}), so they draw without writing depth.
 */
const BASE_LAYER_PARAMETERS = { depthWriteEnabled: false } as const;

/** Parse a `#RRGGBB` string into a deck.gl `[r, g, b]` colour. */
const hexToRgb = (hex: string): [number, number, number] => {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
};

/**
 * Pick a legible ink colour (near-black or white) to sit on top of `rgb`, based
 * on its perceived luminance — so an icon stays visible inside a node of any
 * colour.
 */
const contrastInkRgb = (
  rgb: [number, number, number],
): [number, number, number] => {
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? [15, 18, 25] : [255, 255, 255];
};

/**
 * World-space z for a node part. `order` is the node's front-to-back rank (later
 * = nearer), `level` its part (see the `DETAIL_LEVEL_*` constants). Offset so all
 * values are ≤ 0 (the base layers, at z 0, disable depth writes so they never
 * occlude these). The `+ 1` reserves a band above every regular node for the
 * active node, which is ranked `DETAIL_MAX_NODES` so it jumps to the front.
 * Larger z = nearer; a whole node's band sits above the node behind it, so a
 * front node occludes every part of a back node it overlaps.
 */
const detailZ = (order: number, level: number): number =>
  (order * DETAIL_LEVEL_COUNT +
    level -
    (DETAIL_MAX_NODES + 1) * DETAIL_LEVEL_COUNT) *
  DETAIL_Z_STEP;

/** Truncate a label to {@link DETAIL_LABEL_MAX_CHARS} with an ellipsis. */
const truncateLabel = (label: string): string =>
  label.length > DETAIL_LABEL_MAX_CHARS
    ? `${label.slice(0, DETAIL_LABEL_MAX_CHARS - 1)}…`
    : label;

const iconTextureCache = new Map<IconName, string>();

/**
 * A rasterisable SVG data URL for an icon, forced to a fixed size and a solid
 * fill so deck.gl's {@link IconLayer} can use it as a tintable mask. Reuses the
 * {@link Icon} registry (via static markup) so it stays in sync, and is cached
 * per icon name. Runs only in the browser (called from an effect).
 */
const iconTextureUrl = (name: IconName): string => {
  const cached = iconTextureCache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const markup = renderToStaticMarkup(createElement(Icon, { name }));
  const svg = markup
    .replace(
      /<svg([^>]*)>/,
      (_match, attributes: string) =>
        `<svg${attributes.replace(
          /\s(?:width|height)="[^"]*"/g,
          "",
        )} width="${DETAIL_ICON_TEXTURE}" height="${DETAIL_ICON_TEXTURE}">`,
    )
    // `currentColor` has no CSS context here; pin it so the glyph rasterises as
    // an opaque shape whose alpha is the mask (tinted later via `getColor`).
    .replace(/currentColor/g, "#000000");
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  iconTextureCache.set(name, url);
  return url;
};

interface DetailIconAtlas {
  /** Data-URL of the rasterised atlas, passed straight to `IconLayer.iconAtlas`. */
  url: string;
  mapping: Record<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      mask: boolean;
      anchorX: number;
      anchorY: number;
    }
  >;
}

/**
 * Clamp an orthographic pan `target` so the viewport never shows more than
 * {@link PAN_PADDING_PX} beyond the network's bounding box. `scale` is the
 * world→pixel factor (`2 ** zoom`); `viewport{Width,Height}` are in CSS pixels.
 * Works both when the viewport is smaller than the network (pan within it) and
 * when it is larger (pan the network around inside it) — in either case the
 * network can be nudged until only the padding remains on the trailing side.
 */
const clampPanTarget = (
  target: number[],
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): [number, number, number] => {
  const pad = PAN_PADDING_PX / scale;
  const clampAxis = (
    center: number,
    min: number,
    max: number,
    viewportPx: number,
  ) => {
    const half = viewportPx / (2 * scale);
    // The two per-side limits (viewport may show at most `pad` beyond each
    // edge). Zoomed in they order as [lo, hi]; zoomed out they swap — sorting
    // covers both, so panning is always allowed right up to the padding.
    const a = min - pad + half;
    const b = max + pad - half;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Math.min(hi, Math.max(lo, center));
  };
  return [
    clampAxis(target[0] ?? 0, bounds.minX, bounds.maxX, viewportWidth),
    clampAxis(target[1] ?? 0, bounds.minY, bounds.maxY, viewportHeight),
    target[2] ?? 0,
  ];
};

interface HoverLine {
  source: [number, number];
  target: [number, number];
}

const containerStyles = css({
  position: "relative",
  width: "full",
  height: "full",
  overflow: "hidden",
  // deck.gl renders onto a transparent canvas; give it a surface to sit on.
  backgroundColor: "white",
  cursor: "grab",
});

/**
 * A GPU-accelerated scatterplot of a node/edge graph, rendered with deck.gl.
 *
 * Every node is drawn as a coloured point. Edges are hidden until a node is
 * hovered, at which point the node's incident edges — and the neighbours they
 * connect to — are highlighted. This keeps large graphs legible while still
 * letting you explore local connectivity.
 *
 * Zoomed all the way in, the node layer switches to a detailed variation:
 * larger nodes that show each node's {@link NetworkGraphPoint.icon} inside and
 * its {@link NetworkGraphPoint.label} in a pill beneath, with hover/selection
 * shown as a colour-matched outline rather than the node growing.
 */
export const NetworkGraph = ({
  points,
  edges,
  className,
  selected,
  onSelectedPositionChange,
  onNodeHover,
  onNodeClick,
  onZoom,
}: NetworkGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckGLRef>(null);
  // Pointer-down position, to tell a click apart from a pan on release.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  // Last zoom reported to `onZoom`, so we only fire on actual zoom changes.
  const lastZoomRef = useRef<number | null>(null);
  // Last hovered node id reported to `onNodeHover` (`null` when none), so we
  // only fire when the hovered node actually changes.
  const lastHoveredIdRef = useRef<number | null>(null);
  const [viewState, setViewState] = useState<OrthographicViewState | null>(
    null,
  );
  // Container size (CSS px), tracked so the detail layers can cull points to the
  // viewport in world space.
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  // Mask atlas of every icon used by the data, built once for the IconLayer.
  const [iconAtlas, setIconAtlas] = useState<DetailIconAtlas | null>(null);
  const [hovered, setHovered] = useState<NetworkGraphPoint | null>(null);
  // The zoom the graph was first framed at, used as the reference point from
  // which the point radius grows as the user zooms in.
  const [referenceZoom, setReferenceZoom] = useState<number | null>(null);

  const view = useMemo(() => new OrthographicView({ id: "network-graph" }), []);

  /** Resolve each distinct hex colour to rgb once (there are only a few). */
  const colorByHex = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    for (const point of points) {
      if (!map.has(point.color)) {
        map.set(point.color, hexToRgb(point.color));
      }
    }
    return map;
  }, [points]);

  /** Bounding box of all points, used to frame the initial view. */
  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      if (point.x < minX) {
        minX = point.x;
      }
      if (point.x > maxX) {
        maxX = point.x;
      }
      if (point.y < minY) {
        minY = point.y;
      }
      if (point.y > maxY) {
        maxY = point.y;
      }
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 0;
      minY = 0;
      maxY = 0;
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }, [points]);

  /** Look up a point by id, for resolving edge endpoints. */
  const pointById = useMemo(() => {
    const map = new Map<number, NetworkGraphPoint>();
    for (const point of points) {
      map.set(point.id, point);
    }
    return map;
  }, [points]);

  /** Adjacency list: node id → edges touching it. */
  const adjacency = useMemo(() => {
    const map = new Map<number, NetworkGraphEdge[]>();
    const push = (id: number, edge: NetworkGraphEdge) => {
      const list = map.get(id);
      if (list) {
        list.push(edge);
      } else {
        map.set(id, [edge]);
      }
    };
    for (const edge of edges) {
      push(edge.fromId, edge);
      push(edge.toId, edge);
    }
    return map;
  }, [edges]);

  /**
   * The node whose neighbourhood is highlighted: the hovered node, or — when
   * nothing is hovered — the externally `selected` node.
   */
  const activeNode = useMemo(() => {
    if (hovered) {
      return hovered;
    }
    if (selected != null) {
      return pointById.get(selected) ?? null;
    }
    return null;
  }, [hovered, selected, pointById]);

  /** Edges + neighbour nodes for the active (hovered or selected) node. */
  const highlight = useMemo(() => {
    if (!activeNode) {
      return null;
    }
    const incident = adjacency.get(activeNode.id) ?? [];
    const lines: HoverLine[] = [];
    const neighbourIds = new Set<number>();
    for (const edge of incident) {
      const from = pointById.get(edge.fromId);
      const to = pointById.get(edge.toId);
      if (!from || !to) {
        continue;
      }
      lines.push({ source: [from.x, from.y], target: [to.x, to.y] });
      neighbourIds.add(edge.fromId === activeNode.id ? edge.toId : edge.fromId);
    }
    const neighbours: NetworkGraphPoint[] = [];
    for (const id of neighbourIds) {
      const point = pointById.get(id);
      if (point) {
        neighbours.push(point);
      }
    }
    return { lines, neighbours };
  }, [activeNode, adjacency, pointById]);

  /** Frame the graph to fit the container on mount and on resize. */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const fit = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) {
        return;
      }
      setContainerSize({ width, height });
      const padding = 0.9;
      const zoomX = Math.log2((width * padding) / (bounds.width || 1));
      const zoomY = Math.log2((height * padding) / (bounds.height || 1));
      const zoom = Math.min(zoomX, zoomY);
      // Cap zoom-out so the whole network plus a `ZOOM_OUT_MARGIN` margin fills
      // the viewport — i.e. the view can never span more than that much world.
      const outPadding = 1 / (1 + ZOOM_OUT_MARGIN);
      const minZoom = Math.min(
        Math.log2((width * outPadding) / (bounds.width || 1)),
        Math.log2((height * outPadding) / (bounds.height || 1)),
      );
      // Capture the first framing as the reference for zoom-based radius growth.
      setReferenceZoom((previous) => previous ?? zoom);
      // Only auto-frame until the user takes control of the view.
      setViewState(
        (previous) =>
          previous ?? {
            target: [bounds.centerX, bounds.centerY, 0],
            zoom,
            minZoom,
            maxZoom: zoom + MAX_ZOOM_OFFSET,
          },
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bounds]);

  /**
   * Rasterise every icon used by the data into a single mask atlas for the
   * detail {@link IconLayer}. Async (images load off data URLs); the icons
   * simply appear once ready. Rebuilt only when the set of points changes.
   */
  useEffect(() => {
    const names = [
      ...new Set(points.flatMap((point) => (point.icon ? [point.icon] : []))),
    ];
    if (names.length === 0) {
      // Nothing to rasterise; any prior atlas simply goes unused (no icon data).
      return;
    }
    const cell = DETAIL_ICON_TEXTURE;
    const columns = Math.ceil(Math.sqrt(names.length));
    const rows = Math.ceil(names.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = columns * cell;
    canvas.height = rows * cell;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const mapping: DetailIconAtlas["mapping"] = {};
    let cancelled = false;
    void Promise.all(
      names.map(
        (name, index) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => {
              const x = (index % columns) * cell;
              const y = Math.floor(index / columns) * cell;
              ctx.drawImage(image, x, y, cell, cell);
              mapping[name] = {
                x,
                y,
                width: cell,
                height: cell,
                mask: true,
                anchorX: cell / 2,
                anchorY: cell / 2,
              };
              resolve();
            };
            image.onerror = () => resolve();
            image.src = iconTextureUrl(name);
          }),
      ),
    ).then(() => {
      if (!cancelled) {
        setIconAtlas({ url: canvas.toDataURL(), mapping });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [points]);

  /**
   * Report the selected node's on-screen position, re-projecting on every view
   * change so a consumer's overlay can track the node as it zooms/pans.
   */
  useEffect(() => {
    if (!onSelectedPositionChange) {
      return;
    }
    const element = containerRef.current;
    const node = selected == null ? undefined : pointById.get(selected);
    if (!element || !viewState || !node) {
      onSelectedPositionChange(null);
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    const viewport = view.makeViewport({ width, height, viewState });
    if (!viewport) {
      onSelectedPositionChange(null);
      return;
    }
    const [x = 0, y = 0] = viewport.project([node.x, node.y]);
    onSelectedPositionChange({ x, y });
  }, [onSelectedPositionChange, selected, pointById, viewState, view]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  // Handle clicks ourselves off the native `pointerup` rather than deck.gl's
  // `onClick`: deck delays its click ~300ms to disambiguate a double-click,
  // which makes selection feel laggy. Picking synchronously here fires instantly.
  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      const deck = deckRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!down || !deck || !rect) {
        return;
      }
      // A release that moved more than the threshold is a pan, not a click.
      if (
        Math.hypot(event.clientX - down.x, event.clientY - down.y) >
        CLICK_MOVE_THRESHOLD_PX
      ) {
        return;
      }
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const info = deck.pickObject({
        x,
        y,
        radius: CLICK_PICK_RADIUS_PX,
        layerIds: ["points"],
      });
      const point = (info?.object as NetworkGraphPoint | undefined) ?? null;
      onNodeClick?.({ point, x, y });
    },
    [onNodeClick],
  );

  /** Current zoom level as a single number (orthographic zoom may be a pair). */
  const currentZoom = useMemo(() => {
    const zoom = viewState?.zoom;
    if (zoom === undefined) {
      return null;
    }
    return Array.isArray(zoom) ? zoom[0] : zoom;
  }, [viewState?.zoom]);

  /**
   * Multiplier applied to every point radius so it grows as the user zooms in.
   * `2 ** (zoom - referenceZoom)` is the linear scale factor since orthographic
   * zoom is log2; raising it to {@link ZOOM_RADIUS_RATE} gives the desired rate.
   */
  const radiusScale = useMemo(() => {
    if (currentZoom === null || referenceZoom === null) {
      return 1;
    }
    return 2 ** (ZOOM_RADIUS_RATE * (currentZoom - referenceZoom));
  }, [currentZoom, referenceZoom]);

  /**
   * Point opacity as a function of zoom: {@link POINT_MIN_OPACITY} when zoomed
   * all the way out, rising linearly to full opacity at the midpoint of the zoom
   * range and staying fully opaque as the view zooms further in.
   */
  const pointOpacity = useMemo(() => {
    if (currentZoom === null || referenceZoom === null) {
      return POINT_OPACITY;
    }
    const minZoom = referenceZoom + MIN_ZOOM_OFFSET;
    const maxZoom = referenceZoom + MAX_ZOOM_OFFSET;
    const fraction = (currentZoom - minZoom) / (maxZoom - minZoom);
    const fade = Math.min(1, Math.max(0, fraction / OPACITY_FULL_FRACTION));
    return POINT_MIN_OPACITY + fade * (POINT_OPACITY - POINT_MIN_OPACITY);
  }, [currentZoom, referenceZoom]);

  /**
   * Whether the view is zoomed in far enough to show the detailed node
   * variation (larger nodes with icons + label pills) instead of plain points.
   */
  const isDetailZoom = useMemo(() => {
    if (currentZoom === null || referenceZoom === null) {
      return false;
    }
    return currentZoom >= referenceZoom + DETAIL_ZOOM_OFFSET;
  }, [currentZoom, referenceZoom]);

  /**
   * The points fed to the detail layers: those within the viewport (plus a
   * margin), in world coordinates. Empty unless zoomed into the detail range.
   * Culling keeps the per-frame layer data small; capped at {@link DETAIL_MAX_NODES}.
   */
  const detailPoints = useMemo(() => {
    if (!isDetailZoom || !viewState || !containerSize) {
      return [];
    }
    const { width, height } = containerSize;
    const viewport = view.makeViewport({ width, height, viewState });
    if (!viewport) {
      return [];
    }
    const margin = DETAIL_VIEWPORT_MARGIN_PX;
    // World-space rect covered by the (slightly expanded) viewport.
    const [ax = 0, ay = 0] = viewport.unproject([-margin, -margin]);
    const [bx = 0, by = 0] = viewport.unproject([
      width + margin,
      height + margin,
    ]);
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    const visible: NetworkGraphPoint[] = [];
    for (const point of points) {
      if (
        point.x < minX ||
        point.x > maxX ||
        point.y < minY ||
        point.y > maxY
      ) {
        continue;
      }
      visible.push(point);
      if (visible.length >= DETAIL_MAX_NODES) {
        break;
      }
    }
    return visible;
  }, [isDetailZoom, viewState, containerSize, view, points]);

  const detailIconPoints = useMemo(
    () => detailPoints.filter((point) => point.icon),
    [detailPoints],
  );
  const detailLabelPoints = useMemo(
    () => detailPoints.filter((point) => point.label),
    [detailPoints],
  );

  const layers = useMemo(() => {
    const isHighlighting = highlight !== null;
    const activeId = activeNode?.id ?? null;
    const rgbFor = (point: NetworkGraphPoint) =>
      colorByHex.get(point.color) ?? FALLBACK_COLOR;
    const baseLayers = [
      new ScatterplotLayer<NetworkGraphPoint>({
        id: "points",
        parameters: BASE_LAYER_PARAMETERS,
        data: points,
        pickable: true,
        getPosition: (point) => [point.x, point.y],
        getFillColor: (point) => colorByHex.get(point.color) ?? FALLBACK_COLOR,
        getRadius: POINT_RADIUS,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: POINT_RADIUS,
        // Opacity scales with zoom; an active highlight dims the crowd no
        // brighter than that.
        opacity: isHighlighting
          ? Math.min(pointOpacity, POINT_DIMMED_OPACITY)
          : pointOpacity,
      }),
      new LineLayer<HoverLine>({
        id: "edges",
        parameters: BASE_LAYER_PARAMETERS,
        data: highlight?.lines ?? [],
        getSourcePosition: (line) => line.source,
        getTargetPosition: (line) => line.target,
        getColor: [...EDGE_COLOR, RGBA_OPAQUE] as Color,
        getWidth: 0.75,
        widthUnits: "pixels",
        widthMinPixels: 0.5,
      }),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: "highlight-neighbours",
        parameters: BASE_LAYER_PARAMETERS,
        // The detail variation highlights via a colour-matched outline instead
        // of growing nodes, so the grow layers are suppressed there.
        data: isDetailZoom ? [] : (highlight?.neighbours ?? []),
        getPosition: (point) => [point.x, point.y],
        getFillColor: (point) => colorByHex.get(point.color) ?? FALLBACK_COLOR,
        getRadius: POINT_RADIUS * 1.6,
        radiusScale,
        radiusUnits: "pixels",
        radiusMinPixels: NEIGHBOUR_MIN_RADIUS,
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
      }),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: "highlight-hovered",
        parameters: BASE_LAYER_PARAMETERS,
        data: !isDetailZoom && activeNode ? [activeNode] : [],
        getPosition: (point) => [point.x, point.y],
        getFillColor: (point) => colorByHex.get(point.color) ?? FALLBACK_COLOR,
        getRadius: POINT_RADIUS * 2.2,
        radiusScale,
        radiusUnits: "pixels",
        // Keep the hovered node prominent regardless of zoom level.
        radiusMinPixels: HOVERED_MIN_RADIUS,
        stroked: true,
        getLineColor: [255, 255, 255, RGBA_OPAQUE],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
      }),
    ];

    if (!isDetailZoom) {
      return baseLayers;
    }

    // The detail variation. Each node's parts live in separate layers but share
    // a per-node depth band (see `detailZ`), so the depth buffer — not draw
    // order — decides stacking: a front node occludes every part of a node
    // behind it. `orderById` ranks each visible node front-to-back (later =
    // front), with the active (hovered/selected) node bumped above all the rest
    // so it jumps to the front.
    const orderById = new Map(
      detailPoints.map((point, index) => [point.id, index]),
    );
    if (activeId != null && orderById.has(activeId)) {
      orderById.set(activeId, DETAIL_MAX_NODES);
    }
    const orderOf = (point: NetworkGraphPoint) => orderById.get(point.id) ?? 0;
    const detailLayers = [
      new ScatterplotLayer<NetworkGraphPoint>({
        id: "detail-active-glow",
        // A translucent, colour-matched disc slightly larger than the node; the
        // opaque node drawn on top leaves it showing as a soft glow ring.
        data: activeNode ? [activeNode] : [],
        getPosition: (point) => [
          point.x,
          point.y,
          detailZ(orderOf(point), DETAIL_LEVEL_GLOW),
        ],
        getFillColor: (point) => [...rgbFor(point), DETAIL_GLOW_ALPHA],
        getRadius: DETAIL_NODE_DIAMETER / 2 + DETAIL_GLOW_EXTENT,
        radiusUnits: "pixels",
        updateTriggers: { getPosition: activeId },
      }),
      new TextLayer<NetworkGraphPoint>({
        id: "detail-label-halo",
        data: detailLabelPoints,
        getPosition: (point) => [
          point.x,
          point.y,
          detailZ(orderOf(point), DETAIL_LEVEL_HALO),
        ],
        getText: (point) => truncateLabel(point.label ?? ""),
        getSize: DETAIL_LABEL_FONT_SIZE,
        sizeUnits: "pixels",
        fontFamily: DETAIL_LABEL_FONT,
        characterSet: "auto",
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [0, DETAIL_LABEL_OFFSET],
        // The halo contributes only an outline: its text is invisible and its
        // (opaque white) background is hidden behind the pill, leaving just the
        // ring — white when idle, colour-matched when active.
        getColor: DETAIL_TRANSPARENT,
        background: true,
        backgroundPadding: DETAIL_LABEL_HALO_PADDING,
        backgroundBorderRadius: DETAIL_LABEL_HALO_RADIUS,
        getBackgroundColor: DETAIL_WHITE,
        getBorderColor: (point) =>
          point.id === activeId
            ? [...rgbFor(point), RGBA_OPAQUE]
            : DETAIL_WHITE,
        getBorderWidth: (point) =>
          point.id === activeId
            ? DETAIL_OUTLINE_WIDTH_ACTIVE
            : DETAIL_OUTLINE_WIDTH_IDLE,
        updateTriggers: {
          getPosition: activeId,
          getBorderColor: activeId,
          getBorderWidth: activeId,
        },
      }),
      new TextLayer<NetworkGraphPoint>({
        id: "detail-labels",
        data: detailLabelPoints,
        getPosition: (point) => [
          point.x,
          point.y,
          detailZ(orderOf(point), DETAIL_LEVEL_LABEL),
        ],
        getText: (point) => truncateLabel(point.label ?? ""),
        getSize: DETAIL_LABEL_FONT_SIZE,
        sizeUnits: "pixels",
        fontFamily: DETAIL_LABEL_FONT,
        characterSet: "auto",
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [0, DETAIL_LABEL_OFFSET],
        getColor: DETAIL_INK,
        background: true,
        backgroundPadding: DETAIL_LABEL_PADDING,
        backgroundBorderRadius: DETAIL_LABEL_RADIUS,
        // Opaque white pill so it stays solid over nodes and open space alike.
        getBackgroundColor: DETAIL_WHITE,
        // Border matches the entity colour, tying the label to its node.
        getBorderColor: (point) => [...rgbFor(point), RGBA_OPAQUE],
        getBorderWidth: 1,
        updateTriggers: { getPosition: activeId },
      }),
      new ScatterplotLayer<NetworkGraphPoint>({
        id: "detail-nodes",
        data: detailPoints,
        getPosition: (point) => [
          point.x,
          point.y,
          detailZ(orderOf(point), DETAIL_LEVEL_CIRCLE),
        ],
        getFillColor: (point) => rgbFor(point),
        getRadius: DETAIL_NODE_DIAMETER / 2,
        radiusUnits: "pixels",
        // Idle nodes get a thin white ring for separation; active nodes a
        // thicker colour-matched ring instead of growing.
        stroked: true,
        getLineColor: (point) =>
          point.id === activeId
            ? [...rgbFor(point), RGBA_OPAQUE]
            : DETAIL_WHITE,
        getLineWidth: (point) =>
          point.id === activeId
            ? DETAIL_OUTLINE_WIDTH_ACTIVE
            : DETAIL_OUTLINE_WIDTH_IDLE,
        lineWidthUnits: "pixels",
        updateTriggers: {
          getPosition: activeId,
          getLineColor: activeId,
          getLineWidth: activeId,
        },
      }),
      // Icons sit on top of the nodes. Absent until the atlas has rasterised.
      ...(iconAtlas
        ? [
            new IconLayer<NetworkGraphPoint>({
              id: "detail-icons",
              data: detailIconPoints,
              iconAtlas: iconAtlas.url,
              iconMapping: iconAtlas.mapping,
              getIcon: (point) => point.icon ?? "",
              getPosition: (point) => [
                point.x,
                point.y,
                detailZ(orderOf(point), DETAIL_LEVEL_ICON),
              ],
              getSize: DETAIL_ICON_SIZE,
              sizeUnits: "pixels",
              // Tint the icon mask to a legible ink for the node's colour.
              getColor: (point) => contrastInkRgb(rgbFor(point)),
              updateTriggers: { getPosition: activeId },
            }),
          ]
        : []),
    ];

    return [...baseLayers, ...detailLayers];
  }, [
    points,
    highlight,
    activeNode,
    colorByHex,
    radiusScale,
    pointOpacity,
    isDetailZoom,
    detailPoints,
    detailIconPoints,
    detailLabelPoints,
    iconAtlas,
  ]);

  return (
    <div
      ref={containerRef}
      className={cx(containerStyles, className)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {viewState ? (
        <DeckGL
          ref={deckRef}
          views={view}
          viewState={viewState}
          // Double-click-to-zoom off: clicks are handled via `pointerup` above.
          controller={{ doubleClickZoom: false }}
          layers={layers}
          onHover={(info: PickingInfo) => {
            const object =
              (info.object as NetworkGraphPoint | undefined) ?? null;
            const id = object?.id ?? null;
            // Only react when the hovered node changes (including to no node).
            if (id === lastHoveredIdRef.current) {
              return;
            }
            lastHoveredIdRef.current = id;
            setHovered(object);
            onNodeHover?.({ point: object, x: info.x, y: info.y });
          }}
          onViewStateChange={(params) => {
            const raw = params.viewState as OrthographicViewState;
            const zoom = Array.isArray(raw.zoom) ? raw.zoom[0] : raw.zoom;
            const rect = containerRef.current?.getBoundingClientRect();
            // Constrain panning so the view stays within the network + padding.
            const next: OrthographicViewState =
              rect && zoom !== undefined && raw.target
                ? {
                    ...raw,
                    target: clampPanTarget(
                      raw.target as number[],
                      2 ** zoom,
                      rect.width,
                      rect.height,
                      bounds,
                    ),
                  }
                : raw;
            setViewState(next);
            if (zoom !== undefined && zoom !== lastZoomRef.current) {
              lastZoomRef.current = zoom;
              onZoom?.(zoom);
            }
          }}
          getCursor={({ isDragging, isHovering }) =>
            isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
          }
        />
      ) : null}
    </div>
  );
};
