/**
 * The Atlas-tiled network graph view for the entities visualizer.
 *
 * Mirrors the `network-graph-tiling` Ladle story: the live deck.gl camera drives
 * a tiling {@link Viewport}, which {@link useGetViewportNodes} turns into the set
 * of nodes on screen — fetching the quadtree tiles it covers through a persistent,
 * distance-evicting cache and returning the merged nodes plus request state.
 *
 * Tiles are fetched from the `hash-graph atlas` server via the `/atlas-api`
 * Next.js rewrite (see `next.config.js`), which proxies to it same-origin so the
 * browser avoids a CORS block on the atlas origin.
 */

import { Box, Stack, Typography, useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LoadingSpinner } from "@hashintel/design-system";
import {
  NetworkGraph,
  useGetViewportNodes,
  WORLD_SIZE,
  type NetworkGraphEdge,
  type NetworkGraphHandle,
  type NetworkGraphPoint,
  type Viewport,
  type ViewportNode,
} from "@hashintel/ds-components";

import { MinusRegularIcon } from "../../../shared/icons/minus-regular";
import { PlusRegularIcon } from "../../../shared/icons/plus-regular";
import { GrayToBlueIconButton } from "../gray-to-blue-icon-button";

/**
 * Same-origin path the view fetches tiles from. The `/atlas-api` rewrite in
 * `next.config.js` forwards it to the `hash-graph atlas` server.
 */
const ATLAS_PROXY_BASE = "/atlas-api";

/** Aim for roughly this many tiles across the viewport when choosing a depth. */
const TARGET_TILES_ACROSS = 2;
/** Deepest tile zoom requested, to keep the fetch fan-out bounded. */
const MAX_DEPTH = 6;
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
 * The coordinate space Atlas node positions live in, and the extent the quadtree
 * tiles: the full 16-bit axis `[0, WORLD_SIZE)`. Tile depth is measured against
 * this, deliberately not against the framing bounds passed to `NetworkGraph`
 * (which track where the data actually sits so the camera opens bounding it).
 */
const GRAPH_WORLD: Bounds = {
  minX: 0,
  maxX: WORLD_SIZE,
  minY: 0,
  maxY: WORLD_SIZE,
};

/**
 * Turns the graph's camera (absolute log2 pixels-per-unit zoom + centre), the
 * container size, and the graph's own bounds into a tiling viewport plus a
 * fractional tile depth. The camera rectangle is clipped to `graphBounds` so the
 * tiling follows the visible graph rather than the empty margin around a
 * contained one. Returns `null` before the camera reports in (so the first fetch
 * is the overview) or when the camera sits entirely off the graph.
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

  const x1 = Math.max(centreX - halfWidth, graphBounds?.minX ?? -Infinity);
  const x2 = Math.min(centreX + halfWidth, graphBounds?.maxX ?? Infinity);
  const y1 = Math.max(centreY - halfHeight, graphBounds?.minY ?? -Infinity);
  const y2 = Math.min(centreY + halfHeight, graphBounds?.maxY ?? Infinity);
  if (x2 <= x1 || y2 <= y1) {
    return null; // camera is entirely off the graph
  }

  const graphWorldWidth = GRAPH_WORLD.maxX - GRAPH_WORLD.minX;
  const depth = Math.log2((TARGET_TILES_ACROSS * graphWorldWidth) / (x2 - x1));
  return { x1, x2, y1, y2, zoom: Math.min(depth, MAX_DEPTH) };
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

const toPoint = (node: ViewportNode): NetworkGraphPoint => ({
  id: node.id,
  x: node.x,
  y: node.y,
  color: colorForId(node.id),
});

/**
 * Drives the tiling pipeline from the graph's live camera: every pan/zoom (and
 * resize) recomputes the viewport and hands it to {@link useGetViewportNodes},
 * which fetches its tiles through a persistent cache and returns the merged nodes
 * plus loading/error state. `graphBounds` and `nodeMinDistance` are frozen so
 * streaming new points never reframes the camera. Requires the `hash-graph
 * atlas` server (proxied via `/atlas-api`).
 */
export const NetworkGraphView = () => {
  const theme = useTheme();

  const frameRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<NetworkGraphHandle>(null);
  const cameraRef = useRef<Camera>({ zoom: null, center: null });
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const boundsRef = useRef<Bounds | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);

  const { data, isError, error } = useGetViewportNodes(viewport, {
    baseUrl: ATLAS_PROXY_BASE,
  });

  const points = useMemo(() => (data ?? []).map(toPoint), [data]);

  // Freeze the framing bounds to the dataset extent off the first (overview)
  // load, so the camera opens bounding the data and never reframes as more points
  // stream in. Deriving state during render (not in an effect) is the pattern
  // React recommends here.
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
      setViewport(
        deriveViewport(cameraRef.current, sizeRef.current, boundsRef.current),
      );
    }, DEBOUNCE_MS);
  }, []);

  const handleZoom = useCallback(
    (zoom: number, framingBaseZoom: number) => {
      // `onZoom` reports a framing-normalised zoom (0 = fully framed out), but
      // `deriveViewport` needs the absolute world→pixel zoom. Add the framing
      // base back to recover it.
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
    // Initial overview, deferred through the debounce so the effect doesn't
    // setState during commit.
    schedule();
    return () => {
      observer.disconnect();
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [schedule]);

  return (
    // `.hash-ds-root` scopes the `@hashintel/ds-components` Panda design tokens
    // (e.g. `--sizes-full`) that `NetworkGraph`'s styles reference. Without it the
    // graph container's `height: var(--sizes-full)` resolves to nothing and
    // collapses to 0, so deck.gl never initialises.
    <Box
      ref={frameRef}
      className="hash-ds-root"
      sx={{ position: "relative", width: "100%", height: "100%" }}
    >
      {bounds ? (
        <>
          <NetworkGraph
            ref={graphRef}
            points={points}
            edges={EMPTY_EDGES}
            graphBounds={bounds}
            nodeMinDistance={NODE_MIN_DISTANCE}
            onZoom={handleZoom}
            onPan={handlePan}
          />
          <Stack
            direction="column"
            gap={1}
            sx={{ position: "absolute", bottom: 8, right: 8 }}
          >
            <GrayToBlueIconButton
              aria-label="Zoom in"
              onClick={() => graphRef.current?.zoomIn()}
            >
              <PlusRegularIcon />
            </GrayToBlueIconButton>
            <GrayToBlueIconButton
              aria-label="Zoom out"
              onClick={() => graphRef.current?.zoomOut()}
            >
              <MinusRegularIcon />
            </GrayToBlueIconButton>
          </Stack>
        </>
      ) : (
        <Stack
          sx={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            px: 6,
            textAlign: "center",
          }}
        >
          {isError ? (
            <Typography variant="smallTextParagraphs" color="gray.70">
              Couldn’t reach the Atlas server. Start it, then reload — tiles are
              fetched via the <code>/atlas-api</code> proxy.
              {error?.message ? ` (${error.message})` : null}
            </Typography>
          ) : (
            <LoadingSpinner size={42} color={theme.palette.blue[60]} />
          )}
        </Stack>
      )}
    </Box>
  );
};
