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
  type NetworkGraphEdge,
  type NetworkGraphEdgeInteraction,
  type NetworkGraphHandle,
  type NetworkGraphIcon,
  type NetworkGraphInteraction,
  type NetworkGraphPoint,
  type NetworkGraphSelection,
} from "@hashintel/ds-components";
import {
  formatDataValue,
  type FormattedValuePart,
  type MergedDataTypeSingleSchema,
} from "@local/hash-isomorphic-utils/data-types";

import { useSnackbar } from "../../../components/hooks/use-snackbar";
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
import {
  ATLAS_API_BASE_URL,
  FetchTileError,
} from "../../../components/tiled-network-graph/tiling/fetch-tile";
import {
  useGetViewportNodes,
  ViewportTilesError,
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
/**
 * Fallback deepest tile zoom, used only until the session manifest reports its
 * own `bucketSchedule.maxZoom` (see {@link useGetViewportNodes}'s `tileMaxZoom`).
 * The wire ceiling the quadtree can address; a given generation may tile shallower.
 */
const DEFAULT_TILE_MAX_ZOOM = 16;
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
  maxDepth: number,
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
  return { x1, x2, y1, y2, zoom: Math.min(depth, maxDepth) };
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

/**
 * The SVG URL for a HASH entity/type icon value (the form the graph and popover
 * draw directly, as a tintable mask — the same served type icons `EntityOrTypeIcon`
 * shows elsewhere), or `undefined` for an emoji or other non-SVG value. A `/path`
 * is returned as-is: it's fed to an `<img>`/`IconLayer`/CSS `mask`, which resolves
 * it against the document, so no `window` access (SSR-safe).
 */
const svgIconUrl = (icon: string | undefined): string | undefined => {
  if (
    icon === undefined ||
    !(
      icon.startsWith("/") ||
      icon.startsWith("http://") ||
      icon.startsWith("https://")
    )
  ) {
    return undefined;
  }
  return icon.toLowerCase().split(/[?#]/u)[0]!.endsWith(".svg")
    ? icon
    : undefined;
};

/**
 * A node's icon for the graph — the {@link NetworkGraphIcon} SVG form — resolved
 * from a raw HASH icon value, or undefined for an emoji/other non-SVG value.
 */
const svgIconFromEntityIcon = (
  icon: string | undefined,
): NetworkGraphIcon | undefined => {
  const url = svgIconUrl(icon);
  return url !== undefined ? { svgUrl: url } : undefined;
};

const toPoint = (
  node: ViewportNode,
  color: string,
  icon?: NetworkGraphIcon,
): NetworkGraphPoint => {
  // `label`/`icon` arrive only for tiles fetched with detailed data (the
  // detailed view). The graph draws the label in a pill beneath the node and the
  // icon inside it. Located nodes carry no icon of their own, so the caller
  // resolves one from the node's type and passes it as `icon`; tile nodes fall
  // back to their own icon value resolved to a drawable SVG (emojis are ignored).
  // `color` comes from the type filter's per-type palette, keyed by the node's
  // type.
  const resolvedIcon = icon ?? svgIconFromEntityIcon(node.icon);
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    color,
    ...(node.label !== undefined ? { label: node.label } : {}),
    ...(resolvedIcon !== undefined ? { icon: resolvedIcon } : {}),
  };
};

/**
 * An entity/type icon value the popover and edge-label pill render as text: the
 * value as-is when it is an emoji, or `undefined` when it is a `/path`/`https`
 * URL to an SVG (which those text surfaces can't draw — nodes and the popover
 * chips draw those SVGs directly via {@link svgIconUrl} instead).
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
 * Re-toast a still-failing graph error at most this often (ms), so panning
 * across a dead region doesn't spam identical toasts.
 */
const TILE_ERROR_TOAST_THROTTLE_MS = 10_000;

/**
 * A user-facing summary of a tile or locate failure, for the error toasts and
 * the initial-load message. A transport failure — the request never reached the
 * server — collapses to a generic network message rather than surfacing the raw
 * `TypeError: Failed to fetch`; a server response keeps its status. The
 * {@link ViewportTilesError} thrown when every tile of a viewport fails is
 * unwrapped to the first underlying {@link FetchTileError} it carries.
 */
const describeGraphError = (error: unknown): string => {
  const cause =
    error instanceof ViewportTilesError && error.cause !== undefined
      ? error.cause
      : error;
  if (cause instanceof FetchTileError) {
    if (cause.status === undefined) {
      return "Network error — couldn’t reach the graph server.";
    }
    if (cause.status === 429 || cause.status >= 500) {
      return `The graph server is temporarily unavailable (HTTP ${cause.status}).`;
    }
    return `The graph server rejected the request (HTTP ${cause.status}).`;
  }
  return "Something went wrong loading the graph.";
};

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
  filter,
  onOpenEntity,
}: {
  /** Types shown in the filter dropdown; position drives the default palette. */
  availableEntityTypes: AvailableType[];
  /** The user's per-type colour choices from the filter dropdown. */
  typeColorOverrides: TypeColorOverrides;
  /**
   * The entity-query filter document (as serialized JSON bytes) the graph's view is bound to — built
   * from the header's filter ribbon by `buildEntitiesFilter`. It binds the atlas session, so changing
   * it refetches the whole graph under the new view; see {@link useGetViewportNodes}'s `filter`.
   */
  filter?: string;
  /** Opens the entity drawer for an entity — the popover's "Go to entity". */
  onOpenEntity?: (entityId: EntityId) => void;
}) => {
  const theme = useTheme();
  const { triggerSnackbar } = useSnackbar();

  // A user-facing toast summarising a tile/locate failure (see
  // `describeGraphError`), deduped so identical concurrent failures collapse.
  const notifyGraphError = useCallback(
    (graphError: unknown) => {
      triggerSnackbar.error(describeGraphError(graphError), {
        preventDuplicate: true,
      });
    },
    [triggerSnackbar],
  );

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

  // The SVG icon drawn inside a node in the detailed view, resolved from its
  // type's icon in memory (the wire no longer ships a per-node icon). Every
  // served type icon is kept; emojis and other non-SVG values are ignored (drawn
  // nowhere in the graph).
  const nodeSvgIconFor = useCallback(
    (typeId: VersionedUrl | undefined): NetworkGraphIcon | undefined =>
      svgIconFromEntityIcon(resolveTypeMeta(typeId)?.icon),
    [resolveTypeMeta],
  );

  // The emoji leading a located item's popover, resolved from its type's icon.
  const emojiIconFor = useCallback(
    (typeId: VersionedUrl | undefined): string | undefined =>
      emojiFromEntityIcon(resolveTypeMeta(typeId)?.icon),
    [resolveTypeMeta],
  );

  // A type's popover chip icon: its emoji, or the SVG its icon resolves to
  // (mutually exclusive — see `LocatedEntityIcon`). Undefined when neither.
  const typeIconFor = useCallback(
    (typeId: VersionedUrl | undefined): LocatedEntityIcon | undefined => {
      const emoji = emojiIconFor(typeId);
      const svgUrl = svgIconUrl(resolveTypeMeta(typeId)?.icon);
      if (emoji === undefined && svgUrl === undefined) {
        return undefined;
      }
      return {
        ...(emoji !== undefined ? { emoji } : {}),
        ...(svgUrl !== undefined ? { svgUrl } : {}),
      };
    },
    [emojiIconFor, resolveTypeMeta],
  );

  // Every popover type chip for a node: one per coloured queried type it matches
  // (in that type's palette colour), plus its first direct type as a grey chip
  // when that type isn't itself one of the coloured matches. Unlike the node's
  // own colour — one coloured type sampled at random — the popover lists all the
  // types we hold for the entity, including uncoloured ones (which render grey).
  // Deduped by base URL so a type held at a slightly different version than a
  // coloured id isn't shown twice; coloured matches come first so a coloured type
  // always keeps its colour rather than being dropped in favour of a grey dupe.
  const typeChipsForNode = useCallback(
    (
      typeIndices: readonly number[] | undefined,
      typeId: VersionedUrl | undefined,
    ): LocatedEntityTypeChip[] => {
      const chips: LocatedEntityTypeChip[] = [];
      const seenBaseUrls = new Set<BaseUrl>();
      const addChip = (entityTypeId: VersionedUrl, color: string) => {
        const baseUrl = extractBaseUrl(entityTypeId);
        if (seenBaseUrls.has(baseUrl)) {
          return;
        }
        seenBaseUrls.add(baseUrl);
        const icon = typeIconFor(entityTypeId);
        chips.push({
          label: resolveTypeMeta(entityTypeId)?.title ?? entityTypeId,
          color,
          ...(icon !== undefined ? { icon } : {}),
        });
      };
      for (const index of typeIndices ?? []) {
        const entityTypeId = coloredTypeIds[index];
        if (entityTypeId !== undefined) {
          addChip(
            entityTypeId,
            coloredTypeColors[index] ?? unassignedTypeColor,
          );
        }
      }
      if (typeId !== undefined) {
        addChip(typeId, unassignedTypeColor);
      }
      return chips;
    },
    [coloredTypeIds, coloredTypeColors, resolveTypeMeta, typeIconFor],
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
        nodeSvgIconFor(primaryTypeId(node.typeIndices, node.typeId, node.id)),
      ),
    [nodeSvgIconFor, primaryTypeId],
  );

  const frameRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<NetworkGraphHandle>(null);
  const cameraRef = useRef<Camera>({ zoom: null, center: null });
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const boundsRef = useRef<Bounds | null>(null);
  // The deepest tile depth to request, mirrored from the manifest so the
  // debounced `deriveViewport` can read it without `schedule` depending on it.
  const maxDepthRef = useRef(DEFAULT_TILE_MAX_ZOOM);
  const timerRef = useRef<number | undefined>(undefined);
  // The pending hover→locate delay timer, and a sequence bumped on every node
  // hover so a stale locate can't clear the spinner for a newer (or ended) hover.
  const hoverLocateTimerRef = useRef<number | undefined>(undefined);
  const hoverLocateSeqRef = useRef(0);
  // The last graph-error toast (message + when), so a persisting failure
  // re-toasts only after `TILE_ERROR_TOAST_THROTTLE_MS` rather than on every
  // failed refetch.
  const lastTileErrorToastRef = useRef<{ message: string; at: number } | null>(
    null,
  );

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
  // Whether the hovered node's located ego-graph came back truncated (the edge
  // cap dropped edges and their neighbours — `entity.complete === false`). Drives
  // a "not all connections shown" note under the label box. Reset on every hover
  // change, set only once the locate lands.
  const [hoverIncomplete, setHoverIncomplete] = useState(false);

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

  const { data, isError, error, sessionRevision, tileMaxZoom } =
    useGetViewportNodes(viewport, {
      baseUrl: ATLAS_API_BASE_URL,
      // Always fetch labelled (and icon-ed) tile data, so every visible node is
      // labelled regardless of zoom rather than only in the detailed view.
      includeDetailedData: true,
      coloredTypeIds,
      // Binds the atlas session to the header's filter (see `filter` prop). A
      // change refetches the graph under the new view via `sessionRevision`.
      filter,
    });

  // The session revision the painted state below was resolved under. A mismatch
  // with the live revision triggers the synchronous reset further down, so the
  // reset lands in the render that first sees a new session rather than in an
  // effect after that render has committed. Seeded from the live revision, so a
  // view mounting into an already-replaced session starts published rather than
  // resetting state that is still at its initial value.
  const [publishedRevision, setPublishedRevision] = useState(sessionRevision);

  const points = useMemo(
    () =>
      (data?.nodes ?? []).map((node) =>
        toPoint(node, colorForTypeIndices(node.typeIndices, node.id)),
      ),
    [data, colorForTypeIndices],
  );

  const edges = useMemo(() => (data?.edges ?? []).map(toEdge), [data, toEdge]);

  // The overview query has resolved (so `data` is defined) but carried no nodes:
  // the view is empty — the filters match nothing. Distinct from the initial load
  // (`data` still undefined), so an empty result shows a message rather than an
  // endless spinner. `points.length` rather than `data` alone excludes the single
  // render where the first non-empty load has nodes but `bounds` is not yet set.
  const noResults = data !== undefined && points.length === 0;

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

  // Surface a tile-fetch failure that strikes after the graph is already up.
  // Before the first successful load `bounds` is null and the full-screen
  // message covers it; once the graph renders, `useAtlasQuery` keeps the stale
  // graph visible on a failed pan/zoom refetch, so a toast is the only signal.
  useEffect(() => {
    if (!isError || bounds === null) {
      return;
    }
    const message = describeGraphError(error);
    const now = Date.now();
    const last = lastTileErrorToastRef.current;
    if (
      last &&
      last.message === message &&
      now - last.at < TILE_ERROR_TOAST_THROTTLE_MS
    ) {
      return;
    }
    lastTileErrorToastRef.current = { message, at: now };
    notifyGraphError(error);
  }, [isError, error, bounds, notifyGraphError]);

  const schedule = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setViewport(
        deriveViewport(
          cameraRef.current,
          sizeRef.current,
          boundsRef.current,
          maxDepthRef.current,
        ),
      );
    }, DEBOUNCE_MS);
  }, []);

  // Mirror the manifest's tile max-zoom into the ref the debounced derivation
  // reads, and re-derive once it lands so a generation that tiles shallower than
  // the fallback caps the requested depth. Until it resolves the fallback holds;
  // the initial overview sits well below any cap, so it never over-requests.
  useEffect(() => {
    maxDepthRef.current = tileMaxZoom ?? DEFAULT_TILE_MAX_ZOOM;
    schedule();
  }, [tileMaxZoom, schedule]);

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
  // locate leaves the item selected without a popover and toasts the error (only
  // when it's still the latest click — a superseded locate's failure is moot).
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
        .catch((locateError: unknown) => {
          if (seq === locateSeqRef.current) {
            notifyGraphError(locateError);
          }
        });
    },
    [coloredTypeIds, notifyGraphError],
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
      const types = typeChipsForNode(source.typeIndices, source.typeId);
      setSelection({
        detail: {
          kind: "node",
          title: source.label ?? `Node ${source.id}`,
          types,
          properties: propertyRows(source.properties),
          // The located source carries its own completeness verdicts: the
          // coloredTypeIds mask may not cover every direct type, and its
          // properties are capped.
          typesComplete: entity.typeIdsComplete,
          propertiesComplete: entity.propertiesComplete,
          // The ego-graph's edges are the node's connections; `complete` is false
          // when the edge cap truncated them (rendered as a trailing "+").
          connectionCount: entity.edges.length,
          connectionsComplete: entity.complete,
        },
        entityId: entity.entityId,
      });
      return [source.x, source.y];
    },
    [locatedNodeSelection, typeChipsForNode, propertyRows],
  );

  // Select a node by its atlas row id — highlight it, then locate it and overlay
  // its located neighbourhood (node, edges, neighbours) with a detail popover,
  // exactly as a node click does. `reveal` flies the camera to the node once
  // located, for selecting one that may be off-screen (an edge endpoint); a
  // plain node click leaves the camera put.
  const selectNode = useCallback(
    (atlasId: number, { reveal = false }: { reveal?: boolean } = {}) => {
      setSelected({ node: atlasId });
      setSelection(null);
      setSearchOnTop(false);
      locate(atlasId, (entity) => {
        const focus = showLocatedEntity(entity);
        if (reveal && focus) {
          graphRef.current?.revealPoint([focus[0], focus[1]]);
        }
      });
    },
    [locate, showLocatedEntity],
  );

  // A located endpoint node → the edge popover's from/to entry: the entity's
  // label plus its primary type's icon (the same type its node colour and icon
  // are sampled from) as an emoji or an SVG, and an `onClick` that selects
  // (and reveals) the endpoint's node so the popover label jumps to it. Falls
  // back to a label keyed by the endpoint's row id when the node isn't in the
  // subgraph — still selectable, since that row id is itself a locate source.
  const endpointFor = useCallback(
    (
      node: LocatedEntity["nodes"][number] | undefined,
      fallbackId: string | number,
    ): LocatedEntityEndpoint => {
      const atlasId = node ? node.id : Number(fallbackId);
      const onClick = Number.isFinite(atlasId)
        ? () => selectNode(atlasId, { reveal: true })
        : undefined;
      if (!node) {
        return {
          label: `Node ${fallbackId}`,
          ...(onClick !== undefined ? { onClick } : {}),
        };
      }
      const typeId = primaryTypeId(node.typeIndices, node.typeId, node.id);
      const emoji = emojiIconFor(typeId);
      const svgUrl = svgIconUrl(resolveTypeMeta(typeId)?.icon);
      const icon = {
        ...(emoji !== undefined ? { emoji } : {}),
        ...(svgUrl !== undefined ? { svgUrl } : {}),
      };
      return {
        label: node.label ?? `Node ${node.id}`,
        ...(emoji !== undefined || svgUrl !== undefined ? { icon } : {}),
        ...(onClick !== undefined ? { onClick } : {}),
      };
    },
    [selectNode, primaryTypeId, emojiIconFor, resolveTypeMeta],
  );

  // Prefetched locate ego-graphs for the current search results, keyed by entity
  // id — a search result carries no atlas row id, so it locates by `entityId`.
  // The cache is tagged with the binding it was built against: the queried type
  // set keys each node's type mask, and the atlas session names the rows its
  // entries carry, so when that session is replaced its entries name rows the new
  // one does not answer for. Either change invalidates every entry. Colour-only
  // changes keep `coloredTypeIdsSignature` stable and don't.
  const locateCacheSignature = `${coloredTypeIdsSignature}|session:${sessionRevision}`;
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

  // A replaced session also invalidates the row ids held in *painted* state:
  // `selected` and `hoveredByExternal` are row ids, and hydrating one afterwards
  // opens a different entity than the dot the user pointed at — or one the current
  // principal was never shown. `bounds` is the retired dataset's extent, which
  // frames the camera and clips every viewport the successor requests. So all of
  // it goes, and it goes in the render that first sees the new revision: an effect
  // runs after the commit, and the render it lets through would draw the retired
  // selection, aim the popover at it, and clip the successor's first viewport to
  // the predecessor's extent. Bumping the sequences discards any locate already
  // issued under the retired session, and clearing the delay timer stops one that
  // has not been issued yet.
  //
  // React may discard and repeat this render, and not every step lands in the
  // same place when it does: clearing already-null state and an already-cleared
  // timer do, but the three sequences are monotonic, so a repeat advances them
  // again. What every repeat preserves is the predicate those sequences are read
  // through — an in-flight locate or hover compares the sequence it captured
  // against the current one and keeps its result only when they are equal, so a
  // further bump retires more continuations and cannot re-admit a retired one.
  // The bumps have to happen here rather than in an effect for the same reason
  // the clears do — a locate issued from this render's handlers would otherwise
  // carry a sequence the reset has not yet retired.
  if (publishedRevision !== sessionRevision) {
    setPublishedRevision(sessionRevision);
    locateSeqRef.current += 1;
    hoverSeqRef.current += 1;
    hoverLocateSeqRef.current += 1;
    if (hoverLocateTimerRef.current !== undefined) {
      window.clearTimeout(hoverLocateTimerRef.current);
      hoverLocateTimerRef.current = undefined;
    }
    setSelected(null);
    setSelection(null);
    setAnchor(null);
    setHoveredByExternal(null);
    setHoveredLabel(null);
    setHoverLocateLoading(false);
    setHoverIncomplete(false);
    // The extent is re-frozen off the successor's first load by the derivation
    // above, which fires again once `bounds` is null and points arrive. The ref
    // mirror is cleared in the same breath because the debounced viewport
    // derivation reads it, and it is what clips a request — an effect-updated
    // mirror would clip the successor's first viewport to the retired extent.
    setBounds(null);
    boundsRef.current = null;
  }

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
      for (const entityId of entries.keys()) {
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
  // first; a failed locate leaves nothing selected and toasts the error.
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
        .catch((selectError: unknown) => {
          if (seq === locateSeqRef.current) {
            notifyGraphError(selectError);
          }
        });
    },
    [locateEntity, showLocatedEntity, notifyGraphError],
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
      setHoverIncomplete(false);
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
        // Read the sequence before issuing, not only when the result lands: the
        // request itself is what must not outlive the hover it belongs to, and
        // every retirement of a hover bumps this sequence. Each bump site also
        // clears this timer, so the check normally never fires; it is what makes a
        // bump site that forgets the clear cost one wasted request rather than an
        // overlay of a retired session's rows.
        if (seq !== hoverLocateSeqRef.current) {
          return;
        }
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
            // `complete` is false when the edge cap truncated the ego-graph, so
            // the drawn neighbourhood isn't the node's full set.
            setHoverIncomplete(!entity.complete);
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
      const point = interaction.point;
      if (!point) {
        clearSelection();
        return;
      }
      // Every rendered node (tile or ego-graph) carries a numeric atlas row id;
      // that is what the row-based locate takes. Guard against any other id:
      // still highlight it, but skip the locate.
      const atlasId = Number(point.id);
      if (!Number.isFinite(atlasId)) {
        setSelected({ node: point.id });
        setSelection(null);
        setSearchOnTop(false);
        return;
      }
      selectNode(atlasId);
    },
    [clearSelection, selectNode],
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
        // coloured type set).
        const edgeTypeIds = locatedEdge?.typeIds ?? [];
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
            types: edgeTypes,
            // The entities the link connects, in link direction (source → target).
            endpoints: {
              from: endpointFor(fromNode, edge.fromId),
              to: endpointFor(toNode, edge.toId),
            },
            properties: propertyRows(locatedEdge?.properties),
            // The located edge carries per-edge completeness verdicts; when it
            // isn't in the subgraph, assume complete rather than flag a guess.
            typesComplete: locatedEdge?.typeIdsComplete ?? true,
            propertiesComplete: locatedEdge?.propertiesComplete ?? true,
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
              filter={filter}
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
                  // Match the collapsed search button's height (top-left), growing
                  // taller when the truncation note is shown beneath the label.
                  minHeight: 30,
                  maxWidth: 320,
                  px: 1.25,
                  py: 0.5,
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
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="smallTextParagraphs"
                    sx={{
                      color: "white",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {hoveredLabel}
                  </Typography>
                  {hoverIncomplete ? (
                    <Typography
                      variant="smallTextParagraphs"
                      sx={{
                        color: "rgba(255, 255, 255, 0.65)",
                        fontSize: 11,
                        lineHeight: 1.3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        pl: 1,
                      }}
                    >
                      Not all connections shown
                    </Typography>
                  ) : null}
                </Box>
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
                {describeGraphError(error)} Start it, then reload — tiles are
                fetched through hash-api’s <code>/atlas</code> route.
              </Typography>
            ) : noResults ? (
              <Typography variant="smallTextParagraphs" color="gray.70">
                No entities match the current filters.
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
