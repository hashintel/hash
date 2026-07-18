import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { LoadingSpinner } from "../../Loading/loading-spinner";
import {
  NetworkGraph,
  type NetworkGraphEdge,
  type NetworkGraphPoint,
} from "./network-graph";
import {
  tileZoomForViewport,
  useGetViewportNodes,
  WORLD_SIZE,
  type Viewport,
  type ViewportNode,
} from "./tiling/use-get-viewport-nodes";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/Chart/NetworkGraph/Atlas Tiling",
} satisfies StoryDefault;

/**
 * Same-origin path the story fetches from. A Vite dev proxy (see
 * `vite.config.ts`) forwards it to the local `hash-graph atlas` server, so the
 * browser avoids the CORS block on a direct `127.0.0.1:4010` request.
 */
const ATLAS_PROXY_BASE = "/atlas-api";

/** Aim for roughly this many tiles across the viewport when choosing a depth. */
const TARGET_TILES_ACROSS = 2;
/** Deepest tile zoom the demo requests, to keep the fetch fan-out bounded. */
const DEMO_MAX_DEPTH = 6;
/** Debounce (ms) on camera changes before refetching, coalescing a pan/zoom drag. */
const DEBOUNCE_MS = 150;
/**
 * Fixed minimum node distance passed to the graph. Atlas positions are quantized
 * to an integer grid, so distinct points are at least one unit apart; a constant
 * keeps the camera's max-zoom stable (and avoids an O(n²) recompute per fetch).
 */
const NODE_MIN_DISTANCE = 1;

/** The tiling endpoint returns nodes only; edges stay empty. */
const EMPTY_EDGES: NetworkGraphEdge[] = [];

/** Cheerful, readable node colours, picked deterministically per id. */
const PALETTE = [
  "#4f83ff",
  "#12b886",
  "#f59f00",
  "#e8590c",
  "#ae3ec9",
  "#1098ad",
] as const;

const colorForId = (id: number | string): string => {
  const seed = typeof id === "number" ? id : id.length;
  return PALETTE[Math.abs(seed) % PALETTE.length] ?? PALETTE[0];
};

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
 * Turns the graph's camera (log2 world→pixel zoom + world-space centre) and the
 * container size into an Atlas-world viewport rectangle and a fractional tile
 * depth. Returns `null` until the camera has reported in, so the first fetch is
 * the whole-map overview.
 */
const deriveViewport = (camera: Camera, size: Size): Viewport | null => {
  if (camera.zoom === null || camera.center === null || size.width === 0) {
    return null;
  }
  const scale = 2 ** camera.zoom; // pixels per world unit
  const worldWidth = size.width / scale;
  const worldHeight = size.height / scale;
  const [centreX, centreY] = camera.center;
  // Depth where the visible width spans ~TARGET_TILES_ACROSS tiles.
  const depth = Math.log2((TARGET_TILES_ACROSS * WORLD_SIZE) / worldWidth);
  return {
    x1: centreX - worldWidth / 2,
    x2: centreX + worldWidth / 2,
    y1: centreY - worldHeight / 2,
    y2: centreY + worldHeight / 2,
    zoom: Math.min(depth, DEMO_MAX_DEPTH),
  };
};

/** Bounding box over points, falling back to the whole world when empty. */
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
    return { minX: 0, maxX: WORLD_SIZE, minY: 0, maxY: WORLD_SIZE };
  }
  return { minX, maxX, minY, maxY };
};

const toPoint = (node: ViewportNode): NetworkGraphPoint => ({
  id: node.id,
  x: node.x,
  y: node.y,
  color: colorForId(node.id),
});

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

type Status = "loading" | "idle" | "error";

/**
 * Drives the tiling pipeline from the graph's live camera: every pan/zoom (and
 * resize) recomputes the viewport and hands it to {@link useGetViewportNodes},
 * which fetches its tiles through a persistent cache and returns the merged
 * nodes plus loading/error state. `graphBounds` and `nodeMinDistance` are stable
 * so streaming new points never reframes the camera. Requires the local Atlas
 * server (proxied via `/atlas-api`).
 */
const AtlasTilingStory = () => {
  const frameRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ zoom: null, center: null });
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const timerRef = useRef<number | undefined>(undefined);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);

  const { data, isFetching, isError, error, tileCount } = useGetViewportNodes(
    viewport,
    { baseUrl: ATLAS_PROXY_BASE },
  );

  const points = useMemo(() => (data ?? []).map(toPoint), [data]);

  // Frame once, off the first (overview) load, then keep it stable so streaming
  // new points never reframes the camera. Adjusting state during render (rather
  // than in an effect) is React's recommended way to derive state from freshly
  // loaded data: the guard fires exactly once, with no extra commit.
  if (bounds === null && points.length > 0) {
    setBounds(boundsOf(points));
  }

  const schedule = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setViewport(deriveViewport(cameraRef.current, sizeRef.current));
    }, DEBOUNCE_MS);
  }, []);

  const handleZoom = useCallback(
    (zoom: number) => {
      cameraRef.current = { ...cameraRef.current, zoom };
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

  const status: Status = isError ? "error" : isFetching ? "loading" : "idle";
  const errorMessage = error?.message ?? null;
  const depth = viewport ? tileZoomForViewport(viewport.zoom) : 1;

  return (
    <div ref={frameRef} className={frameStyles}>
      {bounds ? (
        <NetworkGraph
          points={points}
          edges={EMPTY_EDGES}
          graphBounds={bounds}
          nodeMinDistance={NODE_MIN_DISTANCE}
          onZoom={handleZoom}
          onPan={handlePan}
        />
      ) : null}

      <div className={panelStyles}>
        <div className={panelTitleStyles}>Atlas tiling</div>
        <div className={panelRowStyles}>
          <span>tile depth</span>
          <span>{depth}</span>
        </div>
        <div className={panelRowStyles}>
          <span>nodes drawn</span>
          <span>{points.length.toLocaleString()}</span>
        </div>
        <div className={panelRowStyles}>
          <span>tiles cached</span>
          <span>{tileCount}</span>
        </div>
        <div className={panelRowStyles}>
          <span>status</span>
          <span>{status}</span>
        </div>
        <div className={panelHintStyles}>Scroll to zoom, drag to pan.</div>
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
 * Streams graph nodes from the live Atlas tile API as you navigate: panning and
 * zooming the deck.gl view recomputes the visible quadtree tiles (target depth
 * plus every ancestor), fetches the missing ones through a distance-evicting
 * cache with predictive prefetch, and re-renders. Requires the local
 * `hash-graph atlas` server (proxied at `/atlas-api`).
 */
export const Default: Story = () => <AtlasTilingStory />;
