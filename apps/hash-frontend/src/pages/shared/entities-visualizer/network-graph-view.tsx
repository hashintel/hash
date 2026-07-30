/**
 * The Atlas-tiled network graph view for the entities visualizer.
 *
 * The live deck.gl camera drives a tiling {@link Viewport}, which
 * {@link useGetViewportNodes} turns into the set of nodes on screen — fetching
 * the quadtree tiles it covers through a persistent, distance-evicting cache and
 * returning the merged nodes plus request state.
 *
 * Tiles are fetched from the `hash-graph atlas` server through hash-api's
 * `/atlas` route (see {@link ATLAS_API_BASE_URL}): the browser sends the request
 * credentialed to hash-api's own origin, and the atlas answers under the actor
 * hash-api resolved from the session cookie riding it.
 */

import { Box, Stack, Typography, useTheme } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  ArrowDownLeftAndArrowUpRightToCenterIcon,
  ArrowUpRightAndArrowDownLeftFromCenterIcon,
  LoadingSpinner,
} from "@hashintel/design-system";
import {
  NetworkGraph,
  PortalContainerContext,
  type IconName,
  type NetworkGraphEdge,
  type NetworkGraphEdgeInteraction,
  type NetworkGraphHandle,
  type NetworkGraphInteraction,
  type NetworkGraphPoint,
  type NetworkGraphSelection,
} from "@hashintel/ds-components";
import {
  formatDataValue,
  type FormattedValuePart,
  type MergedDataTypeSingleSchema,
} from "@local/hash-isomorphic-utils/data-types";

import { iconNameFromEntityIcon } from "../../../components/tiled-network-graph/entity-icon-name";
import {
  LocatedEntityPopover,
  type LocatedEntityDetail,
  type LocatedEntityEndpoint,
  type LocatedEntityIcon,
  type LocatedEntityPopoverAnchor,
  type LocatedEntityTypeChip,
} from "../../../components/tiled-network-graph/located-entity-popover";
import { NetworkGraphSearch } from "../../../components/tiled-network-graph/network-graph-search";
import {
  fetchLocate,
  type LocatedEntity,
  type LocateEdge,
  type SaltileProperties,
  type SaltilePropertyValue,
} from "../../../components/tiled-network-graph/tiling/fetch-locate";
import { ATLAS_API_BASE_URL } from "../../../components/tiled-network-graph/tiling/fetch-tile";
import {
  useGetViewportNodes,
  WORLD_SIZE,
  type Viewport,
  type ViewportEdge,
  type ViewportNode,
} from "../../../components/tiled-network-graph/tiling/use-get-viewport-nodes";
import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { MinusRegularIcon } from "../../../shared/icons/minus-regular";
import { PlusRegularIcon } from "../../../shared/icons/plus-regular";
import { usePropertyTypes } from "../../../shared/property-types-context";
import { GrayToBlueIconButton } from "../gray-to-blue-icon-button";
import {
  resolveTypeColor,
  typeColorRanks,
  unassignedTypeColor,
} from "./shared/type-colors";

import type { NetworkGraphSearchResult } from "../../../components/tiled-network-graph/network-graph-search";
import type { TypeColorOverrides } from "./shared/type-colors";
import type { AvailableType } from "./shared/use-available-types";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";

/** Aim for roughly this many tiles across the viewport when choosing a depth. */
const TARGET_TILES_ACROSS = 2;
/** Deepest tile zoom requested: the deepest depth the Atlas quadtree addresses. */
const MAX_DEPTH = 16;
/** Debounce (ms) on camera changes before refetching, coalescing a pan/zoom drag. */
const DEBOUNCE_MS = 150;
/**
 * Delay (ms) after a node hover before prefetching its ego-graph, so a pointer
 * skimming across nodes doesn't fire a locate per node.
 */
const HOVER_LOCATE_DELAY_MS = 300;
/**
 * Camera max-zoom (absolute orthographic zoom, `2 ** zoom` px per world unit). A
 * cell is one world unit — a depth-16 tile, the finest the quadtree addresses. We
 * cap where one screen dimension shows `max(width, height) / 100` cells, which
 * reduces to 100 px per cell (`2 ** zoom = 100`), independent of canvas size.
 */
const MAX_ZOOM = Math.log2(100);

/** Slack when comparing the live zoom against a limit, to absorb float drift. */
const ZOOM_LIMIT_EPSILON = 1e-3;

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

const toPoint = (
  node: ViewportNode,
  color: string,
  iconName?: IconName,
): NetworkGraphPoint => {
  // `label`/`icon` arrive only for tiles fetched with detailed data (the
  // detailed view). The graph draws the label in a pill beneath the node and the
  // icon inside it. Located nodes carry no icon of their own, so the caller
  // resolves one from the node's type and passes it as `iconName`; tile nodes
  // fall back to their own icon value resolved to a ds icon name. `color` comes
  // from the type filter's per-type palette, keyed by the node's type.
  const icon = iconName ?? iconNameFromEntityIcon(node.icon);
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    color,
    ...(node.label !== undefined ? { label: node.label } : {}),
    ...(icon !== undefined ? { icon } : {}),
  };
};

/**
 * An entity/type icon value the popover and edge-label pill render as text: the
 * value as-is when it is an emoji, or `undefined` when it is a `/path`/`https`
 * URL to an SVG (which those text surfaces can't draw — nodes resolve those to a
 * ds icon via {@link iconNameFromEntityIcon} instead).
 */
const emojiFromEntityIcon = (icon: string | undefined): string | undefined =>
  icon !== undefined &&
  !icon.startsWith("/") &&
  !icon.startsWith("http://") &&
  !icon.startsWith("https://")
    ? icon
    : undefined;

/**
 * Last meaningful path segment of a property base URL, for the popover — e.g.
 * `https://hash.ai/@h/types/property-type/name/` reads as `name`.
 */
const shortPropName = (url: string): string => {
  const segments = url.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? url;
};

/**
 * A located property value styled as the entity drawer's property table renders
 * it: {@link formatDataValue} produces the same coloured runs (booleans as
 * `True`/`False`, `null` as `Null`). The Atlas wire carries no data-type
 * metadata, so the schema is synthesised from the value's primitive type — no
 * unit labels resolve, but the styling matches.
 */
const formatPropValue = (value: SaltilePropertyValue): FormattedValuePart[] => {
  const schema: MergedDataTypeSingleSchema =
    value === null
      ? { type: "null", description: "" }
      : typeof value === "boolean"
        ? { type: "boolean", description: "" }
        : typeof value === "number"
          ? { type: "number", description: "" }
          : { type: "string", description: "" };
  return formatDataValue(value, schema);
};

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

/** The located item the popover shows, plus the entity "Go to entity" opens. */
interface Selection {
  readonly detail: LocatedEntityDetail;
  /** The upstream entity id (a link entity's, for an edge) the drawer opens. */
  readonly entityId: EntityId;
}

/**
 * Drives the tiling pipeline from the graph's live camera: every pan/zoom (and
 * resize) recomputes the viewport and hands it to {@link useGetViewportNodes},
 * which fetches its tiles through a persistent cache and returns the merged nodes
 * plus loading/error state. `graphBounds` and `maxZoom` are frozen so streaming
 * new points never reframes the camera. Requires the `hash-graph atlas` server
 * (reached through hash-api's `/atlas` route).
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
  onOpenEntity,
}: {
  /** Types shown in the filter dropdown; position drives the default palette. */
  availableEntityTypes: AvailableType[];
  /** The user's per-type colour choices from the filter dropdown. */
  typeColorOverrides: TypeColorOverrides;
  /** Opens the entity drawer for an entity — the popover's "Go to entity". */
  onOpenEntity?: (entityId: EntityId) => void;
}) => {
  const theme = useTheme();

  // In-memory type + property metadata (the entity and property types the app
  // has already loaded). The locate/edges APIs now ship only type ids and
  // property base URLs; the type label, type icon and property titles they used
  // to carry pre-resolved are looked up here instead.
  const { entityTypes } = useEntityTypesContextRequired();
  const { propertyTypes } = usePropertyTypes();

  // Entity type id → { title, icon }, indexed by versioned URL with a base-URL
  // fallback so a type id at a slightly different version than the one held in
  // memory still resolves. Link types are entity types too, so this also covers
  // the types of edges.
  const typeMetadata = useMemo(() => {
    const byVersioned = new Map<
      VersionedUrl,
      { title: string; icon?: string }
    >();
    const byBase = new Map<BaseUrl, { title: string; icon?: string }>();
    for (const { schema } of entityTypes ?? []) {
      const meta = {
        title: schema.title,
        ...(schema.icon !== undefined ? { icon: schema.icon } : {}),
      };
      byVersioned.set(schema.$id, meta);
      byBase.set(extractBaseUrl(schema.$id), meta);
    }
    return { byVersioned, byBase };
  }, [entityTypes]);

  const resolveTypeMeta = useCallback(
    (
      typeId: VersionedUrl | undefined,
    ): { title: string; icon?: string } | undefined => {
      if (typeId === undefined) {
        return undefined;
      }
      return (
        typeMetadata.byVersioned.get(typeId) ??
        typeMetadata.byBase.get(extractBaseUrl(typeId))
      );
    },
    [typeMetadata],
  );

  // Property base URL → title, for the popover's property rows (the wire keys a
  // located entity's properties by base URL).
  const propertyTitleByBaseUrl = useMemo(() => {
    const map = new Map<BaseUrl, string>();
    for (const propertyType of Object.values(propertyTypes ?? {})) {
      map.set(
        propertyType.metadata.recordId.baseUrl,
        propertyType.schema.title,
      );
    }
    return map;
  }, [propertyTypes]);

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

  // The type id whose icon represents a node: the same coloured type its chip
  // and colour were sampled from (so icon, chip and node colour agree), falling
  // back to the node's first direct type when it matches none of the coloured
  // types.
  const primaryTypeId = useCallback(
    (
      typeIndices: readonly number[] | undefined,
      typeId: VersionedUrl | undefined,
      seed: number | string,
    ): VersionedUrl | undefined => {
      const index = pickTypeIndex(typeIndices, seed, coloredTypeColors);
      return (
        (index !== undefined ? coloredTypeIds[index] : undefined) ?? typeId
      );
    },
    [coloredTypeIds, coloredTypeColors],
  );

  // The ds icon for a node, resolved from its type's icon in memory (the wire no
  // longer ships a per-node icon). Drawn inside the node in the detailed view;
  // only SVG-path type icons map to a ds glyph.
  const nodeIconFor = useCallback(
    (typeId: VersionedUrl | undefined): IconName | undefined =>
      iconNameFromEntityIcon(resolveTypeMeta(typeId)?.icon),
    [resolveTypeMeta],
  );

  // The emoji leading a located item's popover, resolved from its type's icon.
  const emojiIconFor = useCallback(
    (typeId: VersionedUrl | undefined): string | undefined =>
      emojiFromEntityIcon(resolveTypeMeta(typeId)?.icon),
    [resolveTypeMeta],
  );

  // A type's popover chip icon: its emoji, or the ds glyph its SVG icon resolves
  // to (mutually exclusive — see `LocatedEntityIcon`). Undefined when neither.
  const typeIconFor = useCallback(
    (typeId: VersionedUrl | undefined): LocatedEntityIcon | undefined => {
      const emoji = emojiIconFor(typeId);
      const name = nodeIconFor(typeId);
      if (emoji === undefined && name === undefined) {
        return undefined;
      }
      return {
        ...(emoji !== undefined ? { emoji } : {}),
        ...(name !== undefined ? { name } : {}),
      };
    },
    [emojiIconFor, nodeIconFor],
  );

  // The popover type chip for a node: the type's icon + title (from memory) +
  // colour of the same type its node colour was sampled from (so chip and node
  // agree), or `undefined` when the node matches none of the coloured types.
  const typeChipForIndices = useCallback(
    (
      typeIndices: readonly number[] | undefined,
      seed: number | string,
    ): LocatedEntityTypeChip | undefined => {
      const index = pickTypeIndex(typeIndices, seed, coloredTypeColors);
      if (index === undefined) {
        return undefined;
      }
      const entityTypeId = coloredTypeIds[index];
      if (entityTypeId === undefined) {
        return undefined;
      }
      const icon = typeIconFor(entityTypeId);
      return {
        label: resolveTypeMeta(entityTypeId)?.title ?? entityTypeId,
        color: coloredTypeColors[index] ?? unassignedTypeColor,
        ...(icon !== undefined ? { icon } : {}),
      };
    },
    [coloredTypeIds, coloredTypeColors, resolveTypeMeta, typeIconFor],
  );

  // A located endpoint node → the edge popover's from/to entry: the entity's
  // label plus its primary type's icon (the same type its node colour and icon
  // are sampled from) as an emoji or a ds glyph. Falls back to a label-only
  // entry keyed by the endpoint's row id when the node isn't in the subgraph.
  const endpointFor = useCallback(
    (
      node: LocatedEntity["nodes"][number] | undefined,
      fallbackId: string | number,
    ): LocatedEntityEndpoint => {
      if (!node) {
        return { label: `Node ${fallbackId}` };
      }
      const typeId = primaryTypeId(node.typeIndices, node.typeId, node.id);
      const emoji = emojiIconFor(typeId);
      const name = nodeIconFor(typeId);
      const icon = {
        ...(emoji !== undefined ? { emoji } : {}),
        ...(name !== undefined ? { name } : {}),
      };
      return {
        label: node.label ?? `Node ${node.id}`,
        ...(emoji !== undefined || name !== undefined ? { icon } : {}),
      };
    },
    [primaryTypeId, emojiIconFor, nodeIconFor],
  );

  // The pill text drawn on an edge while hovered/selected: the link type's icon
  // + label resolved from memory, falling back to the link entity's own label.
  const edgeLabelFor = useCallback(
    (
      typeId: VersionedUrl | undefined,
      fallback: string | undefined,
    ): string | undefined => {
      const meta = resolveTypeMeta(typeId);
      if (meta === undefined) {
        return fallback;
      }
      const emoji = emojiFromEntityIcon(meta.icon);
      return emoji !== undefined ? `${emoji} ${meta.title}` : meta.title;
    },
    [resolveTypeMeta],
  );

  // Popover property rows: the property title (from memory, keyed by base URL)
  // and its formatted value, falling back to the base URL's last segment.
  const propertyRows = useCallback(
    (
      properties: SaltileProperties | null | undefined,
    ): LocatedEntityDetail["properties"] =>
      Object.entries(properties ?? {}).map(([baseUrl, value]) => ({
        key:
          propertyTitleByBaseUrl.get(baseUrl as BaseUrl) ??
          shortPropName(baseUrl),
        value: formatPropValue(value),
      })),
    [propertyTitleByBaseUrl],
  );

  // A tile edge → a renderable edge, carrying the type icon + label for its pill.
  const toEdge = useCallback(
    (edge: ViewportEdge): NetworkGraphEdge => {
      const label = edgeLabelFor(edge.typeId, edge.label);
      return {
        id: edge.id,
        fromId: edge.source,
        toId: edge.target,
        ...(label !== undefined ? { label } : {}),
      };
    },
    [edgeLabelFor],
  );

  // A located edge → a renderable edge; its type comes from the located link's
  // first type (locate ships a link's full type list).
  const toLocatedEdge = useCallback(
    (edge: LocateEdge): NetworkGraphEdge => {
      const label = edgeLabelFor(edge.typeIds[0], edge.label);
      return {
        id: edge.id,
        fromId: edge.source,
        toId: edge.target,
        ...(label !== undefined ? { label } : {}),
      };
    },
    [edgeLabelFor],
  );

  // A located node → a renderable point, with its icon resolved from its type
  // (located nodes carry no icon of their own).
  const toLocatedPoint = useCallback(
    (node: LocatedEntity["nodes"][number], color: string): NetworkGraphPoint =>
      toPoint(
        node,
        color,
        nodeIconFor(primaryTypeId(node.typeIndices, node.typeId, node.id)),
      ),
    [nodeIconFor, primaryTypeId],
  );

  const frameRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<NetworkGraphHandle>(null);
  const cameraRef = useRef<Camera>({ zoom: null, center: null });
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const boundsRef = useRef<Bounds | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  // The pending hover→locate delay timer, and a sequence bumped on every node
  // hover so a stale locate can't clear the spinner for a newer (or ended) hover.
  const hoverLocateTimerRef = useRef<number | undefined>(undefined);
  const hoverLocateSeqRef = useRef(0);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // The graph opens fully framed out, so zoom-out starts at its limit.
  const [zoomLimits, setZoomLimits] = useState({ atMin: true, atMax: false });
  // The label of the node currently under the pointer, shown in a subtle box in
  // the top-right corner. Null when the pointer is over empty space or a node
  // without a label.
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  // Whether the hovered node's ego-graph prefetch is in flight — drives a small
  // spinner in the label box, from hover start until the locate settles.
  const [hoverLocateLoading, setHoverLocateLoading] = useState(false);

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

  // Cancel any pending hover→locate delay when the view unmounts.
  useEffect(
    () => () => {
      if (hoverLocateTimerRef.current !== undefined) {
        window.clearTimeout(hoverLocateTimerRef.current);
      }
    },
    [],
  );

  const { data, isError, error, sessionRevision } = useGetViewportNodes(
    viewport,
    {
      baseUrl: ATLAS_API_BASE_URL,
      // Always fetch labelled (and icon-ed) tile data, so every visible node is
      // labelled regardless of zoom rather than only in the detailed view.
      includeDetailedData: true,
      coloredTypeIds,
    },
  );

  const points = useMemo(
    () =>
      (data?.nodes ?? []).map((node) =>
        toPoint(node, colorForTypeIndices(node.typeIndices, node.id)),
      ),
    [data, colorForTypeIndices],
  );

  const edges = useMemo(() => (data?.edges ?? []).map(toEdge), [data, toEdge]);

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
      void fetchLocate(atlasId, { baseUrl: ATLAS_API_BASE_URL, coloredTypeIds })
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
          point: toLocatedPoint(
            source,
            colorForTypeIndices(source.typeIndices, source.id),
          ),
          edges: entity.edges.map(toLocatedEdge),
          neighbours: neighbours.map((neighbour) =>
            toLocatedPoint(
              neighbour,
              colorForTypeIndices(neighbour.typeIndices, neighbour.id),
            ),
          ),
        },
      };
    },
    [colorForTypeIndices, toLocatedPoint, toLocatedEdge],
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
      const icon = emojiIconFor(
        primaryTypeId(source.typeIndices, source.typeId, source.id),
      );
      setSelection({
        detail: {
          kind: "node",
          title: source.label ?? `Node ${source.id}`,
          ...(icon !== undefined ? { icon } : {}),
          ...(type !== undefined ? { type } : {}),
          properties: propertyRows(source.properties),
        },
        entityId: entity.entityId,
      });
      return [source.x, source.y];
    },
    [
      locatedNodeSelection,
      typeChipForIndices,
      emojiIconFor,
      primaryTypeId,
      propertyRows,
    ],
  );

  // Prefetched locate ego-graphs for the current search results, keyed by entity
  // id — a search result carries no atlas row id, so it locates by `entityId`.
  // The cache is tagged with the binding it was built against: the queried type
  // set keys each node's type mask, and the atlas generation salts the wire row
  // ids its entries carry, so if the session re-pins to another generation those
  // ids name different, existing rows. Either change invalidates every entry.
  // Colour-only changes keep `coloredTypeIdsSignature` stable and don't.
  const locateCacheSignature = `${coloredTypeIdsSignature}|gen:${sessionRevision}`;
  const locateCacheRef = useRef<{
    signature: string;
    entries: Map<EntityId, Promise<LocatedEntity>>;
  }>({ signature: locateCacheSignature, entries: new Map() });

  // The live cache for the current binding, reset lazily when it changes.
  const getLocateCache = useCallback(() => {
    if (locateCacheRef.current.signature !== locateCacheSignature) {
      locateCacheRef.current = {
        signature: locateCacheSignature,
        entries: new Map(),
      };
    }
    return locateCacheRef.current.entries;
  }, [locateCacheSignature]);

  // A re-pin also invalidates the row ids held in *painted* state: `selected` and
  // `hoveredByExternal` are row ids, and hydrating one afterwards opens a
  // different entity than the dot the user pointed at. Bumping the three
  // sequences discards any locate issued under the retired generation.
  useEffect(() => {
    locateSeqRef.current += 1;
    hoverSeqRef.current += 1;
    hoverLocateSeqRef.current += 1;
    if (hoverLocateTimerRef.current !== undefined) {
      window.clearTimeout(hoverLocateTimerRef.current);
      hoverLocateTimerRef.current = undefined;
    }
    setSelected(null);
    setSelection(null);
    setHoveredByExternal(null);
    setHoveredLabel(null);
    setHoverLocateLoading(false);
  }, [sessionRevision]);

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
        { baseUrl: ATLAS_API_BASE_URL, coloredTypeIds },
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

  // Hover a node → show its label (with a spinner) in the top-right box, then
  // after a short delay — if the pointer is still on it — prefetch its ego-graph
  // via the same locate call a click makes. Once it lands (and the node is still
  // hovered), drop the spinner and light up the ego-graph via `hoveredByExternal`.
  // The delay keeps a pointer skimming across nodes from firing a locate per
  // node; the sequence guard drops a stale locate so it can't clear the spinner
  // or highlight for a newer (or ended) hover. A changed/ended hover clears the
  // label and the previous node's highlight (until the new locate lands).
  const handleNodeHover = useCallback(
    (interaction: NetworkGraphInteraction) => {
      hoverLocateSeqRef.current += 1;
      if (hoverLocateTimerRef.current !== undefined) {
        window.clearTimeout(hoverLocateTimerRef.current);
        hoverLocateTimerRef.current = undefined;
      }
      setHoveredByExternal(null);
      const { point } = interaction;
      const label = point?.label ?? null;
      setHoveredLabel(label);
      // Every rendered node carries a numeric atlas row id; that is what the
      // row-based locate takes. Skip (no spinner, no fetch) for anything else.
      const atlasId = point ? Number(point.id) : Number.NaN;
      if (label === null || !Number.isFinite(atlasId)) {
        setHoverLocateLoading(false);
        return;
      }
      setHoverLocateLoading(true);
      const seq = hoverLocateSeqRef.current;
      hoverLocateTimerRef.current = window.setTimeout(() => {
        void fetchLocate(atlasId, {
          baseUrl: ATLAS_API_BASE_URL,
          coloredTypeIds,
        })
          .then((entity) => {
            // A newer (or ended) hover has taken over — leave its state alone.
            if (seq !== hoverLocateSeqRef.current) {
              return;
            }
            setHoverLocateLoading(false);
            setHoveredByExternal(locatedNodeSelection(entity));
          })
          .catch(() => {
            if (seq === hoverLocateSeqRef.current) {
              setHoverLocateLoading(false);
            }
          });
      }, HOVER_LOCATE_DELAY_MS);
    },
    [coloredTypeIds, locatedNodeSelection],
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
      // An edge's id is the link entity's identity (a string), not a row id; the
      // endpoints are row ids, so only those go through `Number`.
      const fromId = Number(edge.fromId);
      if (!Number.isFinite(fromId)) {
        return;
      }
      locate(fromId, (entity) => {
        const source = entity.nodes[0];
        if (!source) {
          return;
        }
        const locatedEdge = entity.edges.find((item) => item.id === edge.id);
        // Pin the edge's geometry to the selection so it stays drawn and anchored
        // (its popover included) even in the compact view, whose sparse on-screen
        // tiles usually don't contain this located edge or its endpoint nodes.
        const nodeById = new Map(
          entity.nodes.map((node) => [node.id, node] as const),
        );
        const fromNode = nodeById.get(Number(edge.fromId));
        const toNode = nodeById.get(Number(edge.toId));
        // Carry the located link's type label onto the selected edge, so its pill
        // shows even in the compact view (whose tile edges carry no detail).
        const selectedEdgeLabel = edgeLabelFor(
          locatedEdge?.typeIds[0],
          locatedEdge?.label,
        );
        const selectedEdge: NetworkGraphEdge = {
          ...edge,
          ...(selectedEdgeLabel !== undefined
            ? { label: selectedEdgeLabel }
            : {}),
        };
        if (fromNode && toNode) {
          setSelected({
            edge: {
              edge: selectedEdge,
              endpoints: [
                toLocatedPoint(
                  fromNode,
                  colorForTypeIndices(fromNode.typeIndices, fromNode.id),
                ),
                toLocatedPoint(
                  toNode,
                  colorForTypeIndices(toNode.typeIndices, toNode.id),
                ),
              ],
            },
          });
        }
        // Locate ships the link's full direct type list. Each becomes a chip
        // floating beside the label (grey dots — link types aren't in the
        // coloured type set), and the first type's emoji leads the title.
        const edgeTypeIds = locatedEdge?.typeIds ?? [];
        const edgeIcon = emojiIconFor(edgeTypeIds[0]);
        const edgeTypes: LocatedEntityTypeChip[] = edgeTypeIds.map((typeId) => {
          const icon = typeIconFor(typeId);
          return {
            label: resolveTypeMeta(typeId)?.title ?? typeId,
            color: unassignedTypeColor,
            ...(icon !== undefined ? { icon } : {}),
          };
        });
        setSelection({
          detail: {
            kind: "edge",
            title: locatedEdge?.label ?? `Edge ${edge.id}`,
            ...(edgeIcon !== undefined ? { icon: edgeIcon } : {}),
            types: edgeTypes,
            // The entities the link connects, in link direction (source → target).
            endpoints: {
              from: endpointFor(fromNode, edge.fromId),
              to: endpointFor(toNode, edge.toId),
            },
            properties: propertyRows(locatedEdge?.properties),
          },
          // An edge is a link entity; its id is that link entity's identity.
          entityId: locatedEdge?.id ?? (String(edge.id) as EntityId),
        });
      });
    },
    [
      clearSelection,
      locate,
      colorForTypeIndices,
      toLocatedPoint,
      resolveTypeMeta,
      emojiIconFor,
      typeIconFor,
      edgeLabelFor,
      endpointFor,
      propertyRows,
    ],
  );

  // "Go to entity" opens the drawer for the selected node's entity (or the edge's
  // link entity), via the consumer-supplied `onOpenEntity`.
  const handleGoTo = useCallback(() => {
    if (selection) {
      onOpenEntity?.(selection.entityId);
    }
  }, [selection, onOpenEntity]);

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
              onNodeHover={handleNodeHover}
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
                onGoTo={onOpenEntity ? handleGoTo : undefined}
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
            {hoveredLabel ? (
              <Box
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  // Match the collapsed search button's height (top-left).
                  height: 30,
                  maxWidth: 320,
                  px: 1.25,
                  borderRadius: 1.5,
                  border: "1px solid rgba(14, 17, 20, 0.12)",
                  backgroundColor: "rgba(14, 17, 20, 0.53)",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 2px 8px rgba(14, 17, 20, 0.08)",
                  pointerEvents: "none",
                }}
              >
                {hoverLocateLoading ? (
                  <LoadingSpinner size={14} thickness={5} color="white" />
                ) : null}
                <Typography
                  variant="smallTextParagraphs"
                  sx={{
                    color: "white",
                    fontWeight: 500,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {hoveredLabel}
                </Typography>
              </Box>
            ) : null}
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
                are fetched through hash-api’s <code>/atlas</code> route.
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
