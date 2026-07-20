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

import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  LoadingSpinner,
} from "@hashintel/design-system";
import {
  iconNameFromEntityIcon,
  NetworkGraph,
  useGetViewportNodes,
  WORLD_SIZE,
  type NetworkGraphEdge,
  type NetworkGraphHandle,
  type NetworkGraphPoint,
  type Viewport,
  type ViewportEdge,
  type ViewportNode,
} from "@hashintel/ds-components";

import { MinusRegularIcon } from "../../../shared/icons/minus-regular";
import { PlusRegularIcon } from "../../../shared/icons/plus-regular";
import { GrayToBlueIconButton } from "../gray-to-blue-icon-button";
import { NetworkGraphSearch } from "./network-graph-search";

import type { NetworkGraphSearchResult } from "./network-graph-search";

/**
 * Same-origin path the view fetches tiles from. The `/atlas-api` rewrite in
 * `next.config.js` forwards it to the `hash-graph atlas` server.
 */
const ATLAS_PROXY_BASE = "/atlas-api";

/** Aim for roughly this many tiles across the viewport when choosing a depth. */
const TARGET_TILES_ACROSS = 2;
/** Deepest tile zoom requested: the deepest depth the Atlas quadtree addresses. */
const MAX_DEPTH = 16;
/** Debounce (ms) on camera changes before refetching, coalescing a pan/zoom drag. */
const DEBOUNCE_MS = 150;
/**
 * Camera max-zoom (absolute orthographic zoom, `2 ** zoom` px per world unit). A
 * cell is one world unit — a depth-16 tile, the finest the quadtree addresses. We
 * cap where one screen dimension shows `max(width, height) / 100` cells, which
 * reduces to 100 px per cell (`2 ** zoom = 100`), independent of canvas size.
 */
const MAX_ZOOM = Math.log2(100);

/** Slack when comparing the live zoom against a limit, to absorb float drift. */
const ZOOM_LIMIT_EPSILON = 1e-3;

/**
 * Absolute camera zoom at/above which the graph switches to its detailed view
 * (icons + label pills), so the view requests detailed tile data to label those
 * nodes. `NetworkGraph` flips to detailed at `maxZoom − 0.5`; matching that here
 * lands the labelled data as the detailed rendering takes over.
 */
const DETAIL_ZOOM = MAX_ZOOM - 0.5;

const zoomButtonSx = {
  background: "rgba(107, 114, 128, 0.16)",
  backdropFilter: "blur(8px)",
  "&.Mui-disabled": {
    background: "rgba(127, 134, 148, 0.06)",
    backdropFilter: "blur(8px)",
    borderColor: "gray.30",
    color: "gray.40",
  },
};

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

const toPoint = (node: ViewportNode): NetworkGraphPoint => {
  // `label`/`icon` arrive only for tiles fetched with detailed data (the
  // detailed view). The graph draws the label in a pill beneath the node and the
  // icon inside it; the entity's icon value resolves to a ds icon name.
  const icon = iconNameFromEntityIcon(node.icon);
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    color: colorForId(node.id),
    ...(node.label !== undefined ? { label: node.label } : {}),
    ...(icon !== undefined ? { icon } : {}),
  };
};

const toEdge = (edge: ViewportEdge): NetworkGraphEdge => ({
  id: edge.id,
  fromId: edge.source,
  toId: edge.target,
});

/**
 * Drives the tiling pipeline from the graph's live camera: every pan/zoom (and
 * resize) recomputes the viewport and hands it to {@link useGetViewportNodes},
 * which fetches its tiles through a persistent cache and returns the merged nodes
 * plus loading/error state. `graphBounds` and `maxZoom` are frozen so streaming
 * new points never reframes the camera. Requires the `hash-graph atlas` server
 * (proxied via `/atlas-api`).
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
  const [detailed, setDetailed] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [searchedPoint, setSearchedPoint] = useState<NetworkGraphPoint | null>(
    null,
  );
  const [isFullScreen, setIsFullScreen] = useState(false);
  // The graph opens fully framed out, so zoom-out starts at its limit.
  const [zoomLimits, setZoomLimits] = useState({ atMin: true, atMax: false });

  // Full-screen the frame element itself (not the document) so the graph fills
  // the screen while its overlaid controls come along. The ResizeObserver below
  // already reflows the graph when the frame resizes.
  const toggleFullScreen = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void frame.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleChange = () => {
      setIsFullScreen(document.fullscreenElement === frameRef.current);
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
    };
  }, []);

  const { data, isError, error } = useGetViewportNodes(viewport, {
    baseUrl: ATLAS_PROXY_BASE,
    includeDetailedData: detailed,
  });

  const points = useMemo(() => {
    const tilePoints = (data?.nodes ?? []).map(toPoint);
    return searchedPoint ? [...tilePoints, searchedPoint] : tilePoints;
  }, [data, searchedPoint]);

  const edges = useMemo(() => (data?.edges ?? []).map(toEdge), [data]);

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
      const camera = cameraRef.current;
      setViewport(deriveViewport(camera, sizeRef.current, boundsRef.current));
      // Cross into detailed data on the same threshold the graph uses to switch
      // to its detailed rendering, so nodes are labelled (and icon-ed) as the
      // detailed view takes over. The whole descent — target tiles and their
      // in-view ancestors — refetches detailed so every visible node is labelled.
      setDetailed(camera.zoom !== null && camera.zoom >= DETAIL_ZOOM);
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
      // The framed-in maximum sits at `MAX_ZOOM - framingBaseZoom` on the same
      // normalised axis; disable whichever button is already at its limit.
      const maxNormalisedZoom = Math.max(0, MAX_ZOOM - framingBaseZoom);
      setZoomLimits({
        atMin: zoom <= ZOOM_LIMIT_EPSILON,
        atMax: zoom >= maxNormalisedZoom - ZOOM_LIMIT_EPSILON,
      });
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

  // The search endpoint has no coordinates, so drop the picked node at a random
  // spot within the graph bounds, select it, and reveal it in the camera.
  const handleSearchSelect = useCallback((result: NetworkGraphSearchResult) => {
    const region = boundsRef.current ?? GRAPH_WORLD;
    const x = region.minX + Math.random() * (region.maxX - region.minX);
    const y = region.minY + Math.random() * (region.maxY - region.minY);
    setSearchedPoint({
      id: result.entityId,
      x,
      y,
      color: colorForId(result.entityId),
      label: result.label,
    });
    graphRef.current?.revealPoint([x, y]);
  }, []);

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
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "white",
      }}
    >
      {bounds ? (
        <>
          <NetworkGraph
            ref={graphRef}
            points={points}
            edges={edges}
            graphBounds={bounds}
            maxZoom={MAX_ZOOM}
            selected={searchedPoint ? { node: searchedPoint.id } : null}
            onZoom={handleZoom}
            onPan={handlePan}
          />
          <NetworkGraphSearch
            onSelect={handleSearchSelect}
            popperContainer={frameRef.current}
          />
          <Stack
            direction="column"
            gap={1}
            sx={{ position: "absolute", bottom: 8, right: 8 }}
          >
            {document.fullscreenEnabled ? (
              <GrayToBlueIconButton
                aria-label={isFullScreen ? "Exit full screen" : "Full screen"}
                onClick={toggleFullScreen}
              >
                {isFullScreen ? (
                  <ArrowDownLeftAndArrowUpRightToCenterIcon />
                ) : (
                  <ArrowUpRightAndArrowDownLeftFromCenterIcon />
                )}
              </GrayToBlueIconButton>
            ) : null}
            <GrayToBlueIconButton
              aria-label="Zoom in"
              disabled={zoomLimits.atMax}
              onClick={() => graphRef.current?.zoomIn()}
              sx={zoomButtonSx}
            >
              <PlusRegularIcon />
            </GrayToBlueIconButton>
            <GrayToBlueIconButton
              aria-label="Zoom out"
              disabled={zoomLimits.atMin}
              onClick={() => graphRef.current?.zoomOut()}
              sx={zoomButtonSx}
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
