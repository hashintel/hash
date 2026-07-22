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
  fetchLocate,
  iconNameFromEntityIcon,
  LocatedEntityPopover,
  NetworkGraph,
  PortalContainerContext,
  useGetViewportNodes,
  WORLD_SIZE,
  type LocatedEntity,
  type LocatedEntityDetail,
  type LocatedEntityPopoverAnchor,
  type NetworkGraphEdge,
  type NetworkGraphEdgeInteraction,
  type NetworkGraphHandle,
  type NetworkGraphInteraction,
  type NetworkGraphPoint,
  type NetworkGraphSelection,
  type SaltilePropertyValue,
  type Viewport,
  type ViewportEdge,
  type ViewportNode,
} from "@hashintel/ds-components";

import { MinusRegularIcon } from "../../../shared/icons/minus-regular";
import { PlusRegularIcon } from "../../../shared/icons/plus-regular";
import { GrayToBlueIconButton } from "../gray-to-blue-icon-button";
import { NetworkGraphSearch } from "./network-graph-search";
import {
  resolveTypeColor,
  typeColorRanks,
  unassignedTypeColor,
} from "./shared/type-colors";

import type { NetworkGraphSearchResult } from "./network-graph-search";
import type { TypeColorOverrides } from "./shared/type-colors";
import type { AvailableType } from "./shared/use-available-types";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

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

const toPoint = (node: ViewportNode, color: string): NetworkGraphPoint => {
  // `label`/`icon` arrive only for tiles fetched with detailed data (the
  // detailed view). The graph draws the label in a pill beneath the node and the
  // icon inside it; the entity's icon value resolves to a ds icon name. `color`
  // comes from the type filter's per-type palette, keyed by the node's type.
  const icon = iconNameFromEntityIcon(node.icon);
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    color,
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

/**
 * A stable, non-negative hash of a node id. Used to seed the per-node colour
 * pick so a node keeps the same sampled colour across re-renders (tiles refetch
 * and re-render constantly on pan/zoom) rather than flickering each frame.
 */
const hashSeed = (seed: number | string): number => {
  const text = String(seed);
  let hash = 0;
  // Modulo a large prime keeps the accumulator bounded (and non-negative)
  // without bitwise ops.
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) % 2147483647;
  }
  return hash;
};

/**
 * Picks which of a node's matched queried types drives its colour. Rather than
 * always taking the first (most-common) match, it samples one at random —
 * deterministically seeded by the node id via {@link hashSeed} so the choice is
 * stable per node. Types that resolve to grey ({@link unassignedTypeColor}) are
 * de-prioritised: a grey type is only ever chosen when the node has no
 * coloured match. Returns the index into `colors` (aligned to `coloredTypeIds`),
 * or `undefined` when the node matches none of the queried types.
 */
const pickTypeIndex = (
  typeIndices: readonly number[] | undefined,
  seed: number | string,
  colors: readonly string[],
): number | undefined => {
  if (typeIndices === undefined || typeIndices.length === 0) {
    return undefined;
  }
  const coloured = typeIndices.filter(
    (index) => (colors[index] ?? unassignedTypeColor) !== unassignedTypeColor,
  );
  const pool = coloured.length > 0 ? coloured : typeIndices;
  return pool[hashSeed(seed) % pool.length];
};

/** The located item the popover shows, plus the world point "Go to entity" reveals. */
interface Selection {
  readonly detail: LocatedEntityDetail;
  readonly focus: readonly [number, number];
}

/**
 * Drives the tiling pipeline from the graph's live camera: every pan/zoom (and
 * resize) recomputes the viewport and hands it to {@link useGetViewportNodes},
 * which fetches its tiles through a persistent cache and returns the merged nodes
 * plus loading/error state. `graphBounds` and `maxZoom` are frozen so streaming
 * new points never reframes the camera. Requires the `hash-graph atlas` server
 * (proxied via `/atlas-api`).
 *
 * Nodes are coloured by entity type using the same palette as the type filter
 * dropdown: the types that resolve to a distinct colour there (by default the
 * most common types by entity count, plus any the user has overridden) are sent
 * to the tile API as `coloredTypeIds`. A node that matches several of them is
 * coloured by one picked at random (seeded by its id so the choice is stable —
 * see `pickTypeIndex`), preferring a coloured match over a greyed-out one. Types
 * without a colour of their own render grey.
 */
export const NetworkGraphView = ({
  availableEntityTypes,
  typeColorOverrides,
}: {
  /** Types shown in the filter dropdown; position drives the default palette. */
  availableEntityTypes: AvailableType[];
  /** The user's per-type colour choices from the filter dropdown. */
  typeColorOverrides: TypeColorOverrides;
}) => {
  const theme = useTheme();

  // The types with a distinct colour in the filter dropdown — the only types
  // worth sending to the tile API (the rest render grey). The default colour set
  // is the most common types by entity count (see `typeColorRanks`), plus any
  // the user has overridden; each carries the colour the dropdown resolves.
  const coloredTypes = useMemo(() => {
    const ranks = typeColorRanks(availableEntityTypes);
    const result: { entityTypeId: VersionedUrl; color: string }[] = [];
    for (const type of availableEntityTypes) {
      const color = resolveTypeColor({
        entityTypeId: type.entityTypeId,
        index: ranks.get(type.entityTypeId) ?? Infinity,
        overrides: typeColorOverrides,
      });
      if (color !== unassignedTypeColor) {
        result.push({ entityTypeId: type.entityTypeId, color });
      }
    }
    return result;
  }, [availableEntityTypes, typeColorOverrides]);

  // The type-id set sent for the tile masks. Kept referentially stable across
  // colour-only override changes (same ids, different colours) via its
  // signature, so recolouring a type doesn't recreate the tile cache and refetch
  // every tile — the colours are applied at render, not baked into the tiles.
  const coloredTypeIdsSignature = coloredTypes
    .map(({ entityTypeId }) => entityTypeId)
    .join(",");
  const coloredTypeIds = useMemo(
    () => coloredTypes.map(({ entityTypeId }) => entityTypeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content signature
    [coloredTypeIdsSignature],
  );

  // Colour per queried type, aligned to `coloredTypeIds` indices — the value a
  // node's `typeIndices` bit resolves to. Recomputes freely as colours change.
  const coloredTypeColors = useMemo(
    () => coloredTypes.map(({ color }) => color),
    [coloredTypes],
  );

  // A node carries the queried types it matches; colour it by one sampled at
  // random (seeded by the node id, so it's stable per node — see
  // `pickTypeIndex`), preferring a coloured match over grey. Falls back to grey
  // when it matches none of the coloured types.
  const colorForTypeIndices = useCallback(
    (
      typeIndices: readonly number[] | undefined,
      seed: number | string,
    ): string => {
      const index = pickTypeIndex(typeIndices, seed, coloredTypeColors);
      if (index === undefined) {
        return unassignedTypeColor;
      }
      return coloredTypeColors[index] ?? unassignedTypeColor;
    },
    [coloredTypeColors],
  );

  // Type title per entity type id, for the located-entity popover's type chip.
  const typeTitleById = useMemo(() => {
    const map = new Map<VersionedUrl, string>();
    for (const type of availableEntityTypes) {
      map.set(type.entityTypeId, type.title);
    }
    return map;
  }, [availableEntityTypes]);

  // The popover type chip for a node: the title + colour of the same type its
  // node colour was sampled from (so chip and node agree), or `undefined` when
  // the node matches none of the coloured types.
  const typeChipForIndices = useCallback(
    (
      typeIndices: readonly number[] | undefined,
      seed: number | string,
    ): LocatedEntityDetail["type"] => {
      const index = pickTypeIndex(typeIndices, seed, coloredTypeColors);
      if (index === undefined) {
        return undefined;
      }
      const entityTypeId = coloredTypeIds[index];
      if (entityTypeId === undefined) {
        return undefined;
      }
      return {
        label: typeTitleById.get(entityTypeId) ?? entityTypeId,
        color: coloredTypeColors[index] ?? unassignedTypeColor,
      };
    },
    [coloredTypeIds, coloredTypeColors, typeTitleById],
  );

  const frameRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<NetworkGraphHandle>(null);
  const cameraRef = useRef<Camera>({ zoom: null, center: null });
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const boundsRef = useRef<Bounds | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [detailed, setDetailed] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // The graph opens fully framed out, so zoom-out starts at its limit.
  const [zoomLimits, setZoomLimits] = useState({ atMin: true, atMax: false });

  // What's highlighted (a clicked or searched node's located neighbourhood, or a
  // clicked edge), the selection's live on-screen anchor (re-reported on
  // zoom/pan), and the located detail the popover shows plus its fly-to point.
  const [selected, setSelected] = useState<NetworkGraphSelection | null>(null);
  const [anchor, setAnchor] = useState<LocatedEntityPopoverAnchor | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  // A search result the user is hovering (not yet picked): its located ego-graph,
  // handed to the graph as `hoveredByExternal` so the matching node lights up with
  // the hover treatment. Cleared when the hover ends or a pick is made.
  const [hoveredByExternal, setHoveredByExternal] =
    useState<NetworkGraphSelection | null>(null);
  // Bumped on every hover change so a slow earlier locate can't land over a newer one.
  const hoverSeqRef = useRef(0);
  // Which overlay wins the z-order when both the search widget and a selection
  // popover are visible: whichever the user actioned last. Selecting an item
  // drops the widget below the popover; focusing/opening the widget raises it
  // back above (see `NetworkGraphSearch`'s `elevated`/`onActivate`).
  const [searchOnTop, setSearchOnTop] = useState(true);
  // Bumped on every click/clear so a slow earlier locate can't land over a newer one.
  const locateSeqRef = useRef(0);

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
    coloredTypeIds,
  });

  const points = useMemo(
    () =>
      (data?.nodes ?? []).map((node) =>
        toPoint(node, colorForTypeIndices(node.typeIndices, node.id)),
      ),
    [data, colorForTypeIndices],
  );

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

  // Drop the selection and its popover (empty-space click, or popover dismiss).
  // Bumping the sequence discards any locate still in flight.
  const clearSelection = useCallback(() => {
    locateSeqRef.current += 1;
    setSelected(null);
    setSelection(null);
  }, []);

  // Locate `atlasId` (a node row id), then apply `onLocated` — but only if this
  // is still the latest click (guards against out-of-order responses). A failed
  // locate just leaves the item selected without a popover.
  const locate = useCallback(
    (atlasId: number, onLocated: (entity: LocatedEntity) => void) => {
      locateSeqRef.current += 1;
      const seq = locateSeqRef.current;
      void fetchLocate(atlasId, { baseUrl: ATLAS_PROXY_BASE, coloredTypeIds })
        .then((entity) => {
          if (seq === locateSeqRef.current) {
            onLocated(entity);
          }
        })
        .catch(() => {});
    },
    [coloredTypeIds],
  );

  // Build a located ego-graph (its source node, incident edges, and neighbours)
  // as a graph selection overlay — shared by the click/pick selection and the
  // search-hover preview. Null when the response carried no source node.
  const locatedNodeSelection = useCallback(
    (entity: LocatedEntity): NetworkGraphSelection | null => {
      const [source, ...neighbours] = entity.nodes;
      if (!source) {
        return null;
      }
      return {
        node: {
          point: toPoint(
            source,
            colorForTypeIndices(source.typeIndices, source.id),
          ),
          edges: entity.edges.map(toEdge),
          neighbours: neighbours.map((neighbour) =>
            toPoint(
              neighbour,
              colorForTypeIndices(neighbour.typeIndices, neighbour.id),
            ),
          ),
        },
      };
    },
    [colorForTypeIndices],
  );

  // Overlay a located ego-graph as the selection and populate the detail popover
  // — shared by node clicks and search-result picks. Returns the source's world
  // point (a fly-to target) or null when the response carried no source.
  const showLocatedEntity = useCallback(
    (entity: LocatedEntity): readonly [number, number] | null => {
      const nodeSelection = locatedNodeSelection(entity);
      const source = entity.nodes[0];
      if (!nodeSelection || !source) {
        return null;
      }
      setSelected(nodeSelection);
      const type = typeChipForIndices(source.typeIndices, source.id);
      setSelection({
        detail: {
          kind: "node",
          title: source.label ?? `Node ${source.id}`,
          ...(source.icon !== undefined ? { icon: source.icon } : {}),
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
      return [source.x, source.y];
    },
    [locatedNodeSelection, typeChipForIndices],
  );

  // Prefetched locate ego-graphs for the current search results, keyed by entity
  // id — a search result carries no atlas row id, so it locates by `entityId`.
  // The cache is tagged with the queried type set it was built against: that set
  // keys each node's type mask, so a change to it invalidates every entry.
  // Colour-only changes keep `coloredTypeIdsSignature` stable and don't.
  const locateCacheRef = useRef<{
    signature: string;
    entries: Map<EntityId, Promise<LocatedEntity>>;
  }>({ signature: coloredTypeIdsSignature, entries: new Map() });

  // The live cache for the current type set, reset lazily when that set changes.
  const getLocateCache = useCallback(() => {
    if (locateCacheRef.current.signature !== coloredTypeIdsSignature) {
      locateCacheRef.current = {
        signature: coloredTypeIdsSignature,
        entries: new Map(),
      };
    }
    return locateCacheRef.current.entries;
  }, [coloredTypeIdsSignature]);

  // Locate an entity by id, memoized in the cache (read-or-start) so a prefetch
  // and a later pick share one request. A rejected locate is dropped so it can
  // be retried.
  const locateEntity = useCallback(
    (entityId: EntityId): Promise<LocatedEntity> => {
      const entries = getLocateCache();
      const existing = entries.get(entityId);
      if (existing) {
        return existing;
      }
      const promise = fetchLocate(
        { entityId },
        { baseUrl: ATLAS_PROXY_BASE, coloredTypeIds },
      );
      entries.set(entityId, promise);
      void promise.catch(() => {
        const current = getLocateCache();
        if (current.get(entityId) === promise) {
          current.delete(entityId);
        }
      });
      return promise;
    },
    [coloredTypeIds, getLocateCache],
  );

  // Prefetch the whole result set so a pick renders without an on-demand round
  // trip, and drop the entries no longer in the results.
  const handleSearchResults = useCallback(
    (results: NetworkGraphSearchResult[]) => {
      const entries = getLocateCache();
      const wanted = new Set(results.map(({ entityId }) => entityId));
      for (const entityId of [...entries.keys()]) {
        if (!wanted.has(entityId)) {
          entries.delete(entityId);
        }
      }
      for (const { entityId } of results) {
        void locateEntity(entityId);
      }
    },
    [getLocateCache, locateEntity],
  );

  // Pick a search result → resolve its prefetched (usually already resolved)
  // locate, overlay its ego-graph with a popover, and reveal the source in the
  // camera. The sequence guard drops a stale locate if a newer pick/click lands
  // first; a failed locate leaves nothing selected.
  const handleSearchSelect = useCallback(
    (result: NetworkGraphSearchResult) => {
      locateSeqRef.current += 1;
      const seq = locateSeqRef.current;
      setSelected(null);
      setSelection(null);
      // Picking supersedes the hover preview; drop it (and any in-flight hover locate).
      hoverSeqRef.current += 1;
      setHoveredByExternal(null);
      setSearchOnTop(false);
      void locateEntity(result.entityId)
        .then((entity) => {
          if (seq !== locateSeqRef.current) {
            return;
          }
          const focus = showLocatedEntity(entity);
          if (focus) {
            graphRef.current?.revealPoint([focus[0], focus[1]]);
          }
        })
        .catch(() => {});
    },
    [locateEntity, showLocatedEntity],
  );

  // Hover a search result → resolve its prefetched (usually already resolved)
  // locate and light up its ego-graph as an external hover — no popover, no camera
  // move. Leaving the results (null) clears it. The sequence guard drops a stale
  // locate so an earlier hover can't land over a newer one.
  const handleSearchHover = useCallback(
    (result: NetworkGraphSearchResult | null) => {
      hoverSeqRef.current += 1;
      if (!result) {
        setHoveredByExternal(null);
        return;
      }
      const seq = hoverSeqRef.current;
      void locateEntity(result.entityId)
        .then((entity) => {
          if (seq === hoverSeqRef.current) {
            setHoveredByExternal(locatedNodeSelection(entity));
          }
        })
        .catch(() => {});
    },
    [locateEntity, locatedNodeSelection],
  );

  // Click a node → highlight it immediately, then locate it and overlay its
  // located neighbourhood (node, edges, neighbours) with a detail popover.
  // Clicking empty space clears the selection.
  const handleNodeClick = useCallback(
    (interaction: NetworkGraphInteraction) => {
      if (!interaction.point) {
        clearSelection();
        return;
      }
      setSelected({ node: interaction.point.id });
      setSelection(null);
      setSearchOnTop(false);
      // Every rendered node (tile or ego-graph) carries a numeric atlas row id;
      // that is what the row-based locate takes. Guard against any other id.
      const atlasId = Number(interaction.point.id);
      if (!Number.isFinite(atlasId)) {
        return;
      }
      locate(atlasId, showLocatedEntity);
    },
    [clearSelection, locate, showLocatedEntity],
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
      setSelection(null);
      setSearchOnTop(false);
      const edgeId = Number(edge.id);
      const fromId = Number(edge.fromId);
      if (!Number.isFinite(fromId)) {
        return;
      }
      locate(fromId, (entity) => {
        const source = entity.nodes[0];
        if (!source) {
          return;
        }
        const locatedEdge = entity.edges.find((item) => item.id === edgeId);
        // Pin the edge's geometry to the selection so it stays drawn and anchored
        // (its popover included) even in the compact view, whose sparse on-screen
        // tiles usually don't contain this located edge or its endpoint nodes.
        const nodeById = new Map(
          entity.nodes.map((node) => [node.id, node] as const),
        );
        const fromNode = nodeById.get(Number(edge.fromId));
        const toNode = nodeById.get(Number(edge.toId));
        if (fromNode && toNode) {
          setSelected({
            edge: {
              edge,
              endpoints: [
                toPoint(
                  fromNode,
                  colorForTypeIndices(fromNode.typeIndices, fromNode.id),
                ),
                toPoint(
                  toNode,
                  colorForTypeIndices(toNode.typeIndices, toNode.id),
                ),
              ],
            },
          });
        }
        setSelection({
          detail: {
            kind: "edge",
            title: locatedEdge?.label ?? `Edge ${edge.id}`,
            ...(locatedEdge?.icon !== undefined
              ? { icon: locatedEdge.icon }
              : {}),
            ...(locatedEdge?.typeLabel !== undefined
              ? {
                  type: {
                    label: locatedEdge.typeLabel,
                    color: unassignedTypeColor,
                  },
                }
              : {}),
            properties: [],
          },
          focus: [source.x, source.y],
        });
      });
    },
    [clearSelection, locate, colorForTypeIndices],
  );

  // "Go to entity" reveals the located point — bringing it on screen if it isn't
  // (a no-op when it already is, e.g. the node you just clicked).
  const handleGoTo = useCallback(() => {
    if (selection) {
      graphRef.current?.revealPoint([selection.focus[0], selection.focus[1]]);
    }
  }, [selection]);

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
    // collapses to 0, so deck.gl never initialises. The same element is supplied
    // as the `PortalContainerContext` so the located-entity popover (which
    // portals its content) renders inside that token scope rather than at
    // `document.body`, where the scoped colour tokens wouldn't resolve.
    <PortalContainerContext.Provider value={frameRef}>
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
              selected={selected}
              hoveredByExternal={hoveredByExternal}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onSelectedPositionChange={setAnchor}
              onZoom={handleZoom}
              onPan={handlePan}
            />
            {selection && anchor ? (
              <LocatedEntityPopover
                triggerRef={frameRef}
                anchor={anchor}
                detail={selection.detail}
                onClose={clearSelection}
                onGoTo={handleGoTo}
                onActivate={() => setSearchOnTop(false)}
              />
            ) : null}
            <NetworkGraphSearch
              elevated={searchOnTop}
              onActivate={() => setSearchOnTop(true)}
              onSelect={handleSearchSelect}
              onHover={handleSearchHover}
              onResultsChange={handleSearchResults}
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
                Couldn’t reach the Atlas server. Start it, then reload — tiles
                are fetched via the <code>/atlas-api</code> proxy.
                {error?.message ? ` (${error.message})` : null}
              </Typography>
            ) : (
              <LoadingSpinner size={42} color={theme.palette.blue[60]} />
            )}
          </Stack>
        )}
      </Box>
    </PortalContainerContext.Provider>
  );
};
